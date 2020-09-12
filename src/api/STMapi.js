import tools from '../tools';
import logger from './Logger';

const MAX_WRITE_BLOCK_SIZE_STM32 = 256;
const MAX_READ_BLOCK_SIZE = 256;
const MAX_WRITE_BLOCK_SIZE_STM8 = 128;

// use control signals to trigger bootloader activation and device hardware reset
// false = pin hight, true = pin low
const RESET_PIN = "dataTerminalReady";
const BOOT0_PIN = "requestToSend"; // STM32
const PIN_HIGH = false;
const PIN_LOW = true;

const SYNCHR = 0x7F;
const ACK = 0x79;
const NACK = 0x1F;

const CMD_GET = 0x00;
const CMD_GV = 0x01;
// GET ID command used to identify the STM family. If it's present it's STM32, STM8 otherwise
const CMD_GID = 0x02;
const CMD_READ = 0x11;
const CMD_GO = 0x21;
const CMD_WRITE = 0x31;
const CMD_ERASE = 0x43;
const CMD_EXTENDED_ERASE = 0x44;
const CMD_WPUN = 0x73;
const CMD_RDU_PRM = 0x92;

// Address for erase_write_routines for STM8 S/A
const STM8_WRITE_CODE_ADDRESS = 0xA0;

const EwrLoadState = Object.freeze({
    NOT_LOADED: Symbol("not_loaded"),
    LOADING: Symbol("loading"),
    LOADED: Symbol("loaded")
});

function u8a(array) {
    return new Uint8Array(array);
}

export class InfoGV {
    constructor() {
        // Bootloader version
        this.blVersion = null;
        // Number of times the read protection was disabled
        this.countRPdisabled = -1;
        // Number of times the read protection was enabled
        this.countRPenabled = -1;
    }
}

export class InfoGET {
    constructor() {
        // Bootloader version
        this.blVersion = null;
        // List of supported commands
        this.commands = [];
    }

    getFamily() {
        return this.commands.indexOf(CMD_GID) === -1 ? 'STM8' : 'STM32';
    }
}

export class STMApi {
    constructor(serial) {
        if (!serial) {
            throw new Error('Serial port object not provided');
        }
        this.serial = serial;
        // reply mode which is necessary for some STM8 MCUs
        this.replyMode = false;
        // Indicates if the STM8 erase_write_routines are already loaded
        this.ewrLoadState = EwrLoadState.NOT_LOADED;
        // max: STM8 = 128, STM32 = 256. must be mutliple of 4
        this.writeBlockSize = MAX_WRITE_BLOCK_SIZE_STM8;
        this.readBlockSize = MAX_READ_BLOCK_SIZE;
        // list of supported commands by the target
        this.commands = [];
        // name of the stm8 routines file
        this.stm8RoutinesFile = null;
    }

    /**
     * Initializes erase_write_routines for STM8 S/A
     * @param {flash:"0"|"32"|"128"|"256", blVersion:string} device Flash size of the target MCU
     */
    setDevice(device) {
        this.ewrLoadState = EwrLoadState.NOT_LOADED;

        if (!device.blVersion || !device.flash) {
            return;
        }

        if (device.flash === '0') { // STM8 L
            this.ewrLoadState = EwrLoadState.LOADED;
            return;
        } else if (device.flash !== '32' && device.flash !== '128' && device.flash !== '256') {
            throw new Error('Unsupported device selected: ' + device);
        }

        this.stm8RoutinesFile = 'res/stm8_routines/E_W_ROUTINEs_' + device.flash + 'K_ver_' + device.blVersion + '.bin';
    }

    /**
     * Connect to the target by resetting it and activating the ROM bootloader
     * @param {object} params
     * @returns {Promise}
     */
    async connect(params) {
        this.ewrLoadState = EwrLoadState.NOT_LOADED;
        return new Promise((resolve, reject) => {
            logger.log('Connecting with baudrate ' + params.baudrate + ' and reply mode ' + (params.replyMode ? 'on' : 'off'));
            if (this.serial.isOpen()) {
                reject(new Error('Port already opened'));
                return;
            }

            this.replyMode = params.replyMode || false;

            this.serial.open({
                baudRate: parseInt(params.baudrate, 10),
                parity: this.replyMode ? 'none' : 'even'
            })
                .then(() => {
                    // set init state of the NRST pin to high
                    // for stm32 set the BOOT0 pin to low. 
                    let signal = {}
                    signal[RESET_PIN] = PIN_HIGH;
                    signal[BOOT0_PIN] = PIN_LOW;
                    return this.serial.control(signal);
                })
                .then(() => this.activateBootloader())
                .then(resolve)
                .catch(reject);
        });
    }

    /**
     * Close current connection. Before closing serial connection disable bootloader and reset target
     * @returns {Promise}
     */
    async disconnect() {
        return new Promise((resolve, reject) => {
            let signal = {}
            signal[BOOT0_PIN] = PIN_LOW;
            this.serial.control(signal)
                .then(() => this.resetTarget())
                .then(() => this.serial.close())
                .then(resolve)
                .catch(reject);
        });

    }

    /**
     * Write data to memory. If the data exceeds the max frame size it will be splitted and sent in chunks automatically 
     * @param {Uint8Array} data Data to write
     * @param {number} address Address to write at
     * @param {Function} onProgress Callback to notify progress
     * @returns {Promise}
     */
    async write(data, address, onProgress) {
        return new Promise(async (resolve, reject) => {
            logger.log('Writing ' + data.length + ' bytes to flash at address 0x' + address.toString(16) + ' using ' + this.writeBlockSize + ' bytes chunks');
            if (!this.serial.isOpen()) {
                reject(new Error('Connection must be established before sending commands'));
                return;
            }

            let blocksCount = Math.ceil(data.byteLength / this.writeBlockSize);

            let offset = 0;
            let blocks = [];
            for (let i = 0; i < blocksCount; i++) {
                let block = {};

                if (i < blocksCount - 1) {
                    block.data = data.subarray(offset, offset + this.writeBlockSize);
                } else {
                    block.data = data.subarray(offset);
                }
                offset += block.data.length;
                blocks.push(block);
            }

            for (let i = 0; i < blocks.length; i++) {
                let block = blocks[i];
                try {
                    //logger.log('Writing block ' + (i + 1) + '/' + blocksCount);
                    if (onProgress) {
                        onProgress(i, blocksCount);
                    }
                    await this.cmdWRITE(block.data, address + i * this.writeBlockSize);
                } catch (e) {
                    reject(e);
                    return;
                }
            }
            logger.log('Finished writing');
            resolve();
        });
    }

    /**
     * Do a full erase of the flash
     * @returns {Promise}
     */
    async eraseAll() {
        return new Promise(async (resolve, reject) => {
            if (!this.serial.isOpen()) {
                reject(new Error('Connection must be established before sending commands'));
                return;
            }

            if (!this.commands.length) {
                reject(new Error('Execute GET command first'));
                return;
            }

            if (this.ewrLoadState == EwrLoadState.NOT_LOADED) {
                try {
                    await this.sendEWR();
                } catch (e) {
                    reject(e);
                    return;
                }
            }

            let eraseCmd, eraseFlash;
            if (this.commands.indexOf(CMD_ERASE) !== -1) {
                eraseCmd = [CMD_ERASE, 0xFF ^ CMD_ERASE];
                eraseFlash = [0xFF, 0x00];
            } else if (this.commands.indexOf(CMD_EXTENDED_ERASE) !== -1) {
                eraseCmd = [CMD_EXTENDED_ERASE, 0xFF ^ CMD_EXTENDED_ERASE];
                eraseFlash = [0xFF, 0xFF, 0x00];
            } else {
                reject(new Error('No erase command found'));
                return;
            }

            this.serial.write(u8a(eraseCmd))
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    return this.serial.write(u8a(eraseFlash));
                })
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    resolve();
                })
                .catch(reject);
        });
    }

    /**
     * Executes GET command
     * @returns {Promise<InfoGET>}
     */
    async cmdGET() {
        return new Promise((resolve, reject) => {
            if (!this.serial.isOpen()) {
                reject(new Error('Connection must be established before sending commands'));
                return;
            }

            this.serial.write(u8a([CMD_GET, 0xFF ^ CMD_GET]))
                .then(() => this.readResponse())
                .then(async (resp) => {
                    let response = Array.from(resp);
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }

                    if (response.length === 1) { // TODO stm8 sends the bytes with delay. Always or on in reply mode only? 
                        let res = await this.readResponse();
                        response[1] = res[0];
                        res = await this.readResponse(); // bl version
                        response[2] = res[0];
                        for (let i = 0; i <= response[1]; i++) {
                            res = await this.readResponse();
                            response[3 + i] = res[0];
                        }
                    }

                    let info = new InfoGET();
                    info.blVersion = (response[2] >> 4) + '.' + (response[2] & 0x0F);
                    for (let i = 0; i < response[1]; i++) {
                        info.commands.push(response[3 + i]);
                    }
                    this.commands = info.commands;
                    if (info.getFamily() === 'STM32') {
                        this.writeBlockSize = MAX_WRITE_BLOCK_SIZE_STM32;
                        this.ewrLoadState = EwrLoadState.LOADED;
                    } else {
                        this.writeBlockSize = MAX_WRITE_BLOCK_SIZE_STM8;
                    }
                    resolve(info);
                })
                .catch(reject);
        });
    }

    /**
     * Execute GO command
     * @param {number} address Memory address to start code execution
     * @returns {Promise}
     */
    async cmdGO(address) {
        return new Promise((resolve, reject) => {
            let addressFrame;

            if (!Number.isInteger(address)) {
                reject(new Error('Invalid address parameter'));
                return;
            }

            if (!this.serial.isOpen()) {
                reject(new Error('Connection must be established before sending commands'));
                return;
            }

            addressFrame = tools.num2a(address, 4);
            addressFrame.push(this.calcChecksum(addressFrame, false));

            this.serial.write(u8a([CMD_GO, 0xFF ^ CMD_GO]))
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    return this.serial.write(u8a(addressFrame));
                })
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    resolve();
                })
                .catch(reject);
        });
    }

    /**
     * Execute single READ command
     * @param {number} address Memory address to read from
     * @param bytesCount Number of bytes to read
     * @returns {Promise}
     */
    async cmdREAD(address, bytesCount) {
        return new Promise((resolve, reject) => {
            let addressFrame;

            if (!Number.isInteger(address) || address < 0) {
                reject(new Error('Invalid address parameter'));
                return;
            }

            if (!Number.isInteger(bytesCount) || bytesCount <= 0 || bytesCount > this.readBlockSize) {
                reject(new Error('Invalid bytesCount parameter'));
                return;
            }

            if (!this.serial.isOpen()) {
                reject(new Error('Connection must be established before sending commands'));
                return;
            }

            addressFrame = tools.num2a(address, 4);
            addressFrame.push(this.calcChecksum(addressFrame, false));

            this.serial.write(u8a([CMD_READ, 0xFF ^ CMD_READ]))
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    return this.serial.write(u8a(addressFrame));
                })
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    // The number of bytes to be read -1 (0 <= N <= 255)
                    return this.serial.write(u8a([bytesCount - 1, (bytesCount - 1) ^ 0xFF]));
                })
                .then(() => this.readResponse())
                .then(async (response) => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }

                    if (this.replyMode) {
                        for (let i = 0; i < bytesCount; i++) {
                            await this.readResponse(); // read and ignore
                        }
                    }
                    resolve(result.subarray(1));
                })
                .catch(reject);
        });
    }

    /**
     * Execute Write Unprotect command
     * STM32 only
     * @returns {Promise}
     */
    async cmdWPUN() {
        return new Promise((resolve, reject) => {
            if (!this.serial.isOpen()) {
                reject(new Error('Connection must be established before sending commands'));
                return;
            }

            if (this.commands.indexOf(CMD_WPUN) === -1) {
                reject(new Error('Write Unprotect command is not supported by the current target'));
                return;
            }

            this.serial.write(u8a([CMD_WPUN, 0xFF ^ CMD_WPUN]))
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    return this.readResponse();
                })
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    resolve();
                })
                .catch(reject);
        });
    }

    /**
     * Execute Readout Unprotect command
     * STM32 only
     * @returns {Promise}
     */
    async cmdRPUN() {
        return new Promise((resolve, reject) => {
            if (!this.serial.isOpen()) {
                reject(new Error('Connection must be established before sending commands'));
                return;
            }

            if (!this.commands.length) {
                reject(new Error('Execute GET command first'));
                return;
            }

            if (this.commands.indexOf(CMD_RDU_PRM) === -1) {
                reject(new Error('Readout Unprotect command is not supported by the current target'));
                return;
            }

            this.serial.write(u8a([CMD_RDU_PRM, 0xFF ^ CMD_RDU_PRM]))
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    return this.readResponse();
                })
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    resolve();
                })
                .catch(reject);
        });
    }

    /**
     * Execute single WRITE command
     * @param {Uint8Array} data Data to write
     * @param {number} address Address to write at
     * @returns {Promise}
     */
    async cmdWRITE(data, address) {
        return new Promise(async (resolve, reject) => {
            if (!(data instanceof Uint8Array)) {
                reject(new Error('Missinf data to write'));
                return;
            }

            if (!Number.isInteger(address) || address < 0) {
                reject(new Error('Invalid address parameter'));
                return;
            }

            if (data.length > this.writeBlockSize) {
                reject(new Error('Data is too big, use write()'));
                return;
            }

            if (!this.commands.length) {
                reject(new Error('Execute GET command first'));
                return;
            }

            if (!this.serial.isOpen()) {
                reject(new Error('Connection must be established before sending commands'));
                return;
            }

            if (this.ewrLoadState == EwrLoadState.NOT_LOADED) {
                try {
                    await this.sendEWR();
                } catch (e) {
                    reject(e);
                    return;
                }
            }

            // Frame: number of bytes to be written (1 byte), the data (N + 1 bytes) (multiple of 4) and checksum
            let checksum = this.calcChecksum(data, true);
            let frame = new Uint8Array(data.length + 2);
            frame[0] = [data.length - 1]; // 
            frame.set(data, 1);
            frame[frame.length - 1] = checksum;

            let addressFrame = tools.num2a(address, 4);
            addressFrame.push(this.calcChecksum(addressFrame, false));

            this.serial.write(u8a([CMD_WRITE, 0xFF ^ CMD_WRITE]))
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    return this.serial.write(u8a(addressFrame));
                })
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    return this.serial.write(frame);
                })
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    resolve();
                })
                .catch(reject);
        });
    }

    /**
     * Execute Get ID command
     * STM32 only
     */
    async cmdGID() {
        return new Promise((resolve, reject) => {
            if (!this.commands.length) {
                reject(new Error('Execute GET command first'));
                return;
            }

            if (this.commands.indexOf(CMD_GID) === -1) {
                reject(new Error('GET ID command is not supported by the current target'));
                return;
            }

            if (!this.serial.isOpen()) {
                reject(new Error('Connection must be established before sending commands'));
                return;
            }

            this.serial.write(u8a([CMD_GID, 0xFF ^ CMD_GID]))
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }
                    let pid = '0x' + tools.b2hexstr(response[2]) + tools.b2hexstr(response[3]);
                    resolve(pid);
                })
                .catch(reject);
        });
    }

    /**
     * Get Version & Read Protection Status command
     * STM32 only
     * @returns {Promise<InfoGV>}
     */
    async cmdGV() {
        return new Promise((resolve, reject) => {
            if (!this.commands.length) {
                reject(new Error('Execute GET command first'));
                return;
            }

            if (this.commands.indexOf(CMD_GV) === -1) {
                reject(new Error('Get Version & Read Protection Status command is not supported by the current target'));
                return;
            }

            if (!this.serial.isOpen()) {
                reject(new Error('Connection must be established before sending commands'));
                return;
            }

            this.serial.write(u8a([CMD_GV, 0xFF ^ CMD_GV]))
                .then(() => this.readResponse())
                .then(response => {
                    if (response[0] !== ACK) {
                        throw new Error('Unexpected response');
                    }

                    let info = new InfoGV();
                    info.blVersion = (result[1] >> 4) + '.' + (result[1] & 0x0F);
                    info.countRPenabled = result[2];
                    info.countRPdisabled = result[3];
                    resolve(info);
                })
                .catch(reject);
        });
    }

    /**
     * Serial read wrapper for single response with automatic echo mode
     * @private
     * @returns {Promise}
     */
    async readResponse() {
        return new Promise((resolve, reject) => {
            let result = null;
            this.serial.read()
                .then(response => {
                    result = response;
                    if (this.replyMode) {
                        return this.serial.write(u8a([result[0]]));
                    }
                    return Promise.resolve();
                })
                .then(() => {
                    resolve(result);
                })
                .catch(reject)
        });
    }

    /**
     * Writes erase_write_routines for STM8 A/S to RAM. All erase/write operations won't work without them
     * @private
     */
    async sendEWR() {
        return new Promise(async (resolve, reject) => {
            if (!this.ewRoutines) {
                if (!this.stm8RoutinesFile) {
                    reject(new Error('Select your device first by calling setDevice'));
                    return;
                }

                logger.log('Loading Erase-Write-Routines ' + this.stm8RoutinesFile);
                this.ewRoutines = await fetch(this.stm8RoutinesFile)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Failed fetching ' + this.stm8RoutinesFile);
                        }
                        return response.arrayBuffer();
                    })
                    .then(buffer => {
                        return new Uint8Array(buffer);
                    })
                    .catch(reject);
            }

            this.ewrLoadState = EwrLoadState.LOADING;
            logger.log('Sending Erase-Write-Routines to the device...');
            this.write(this.ewRoutines, STM8_WRITE_CODE_ADDRESS)
                .then(() => {
                    this.ewrLoadState = EwrLoadState.LOADED;
                    logger.log('Erase-Write-Routines loaded');
                    resolve();
                })
                .catch(error => {
                    this.ewrLoadState = EwrLoadState.NOT_LOADED;
                    reject(error);
                });
        });
    }

    /**
     * Activate the ROM bootloader
     * @private
     * @returns {Promise}
     */
    async activateBootloader() {
        return new Promise((resolve, reject) => {
            logger.log('Activating bootloader...');
            if (!this.serial.isOpen()) {
                reject(new Error('Port must be opened before activating the bootloader'));
                return;
            }

            let signal = {};
            signal[BOOT0_PIN] = PIN_HIGH;
            this.serial.control(signal) // set BOOT0 pin hight for STM32
                .then(() => this.resetTarget())
                .then(() => {
                    signal[BOOT0_PIN] = PIN_LOW;
                    return this.serial.control(signal) // return BOOT0 to low to allow normal code execution after reset
                })
                .then(() => this.serial.write(u8a([SYNCHR])))
                .then(() => this.serial.read())
                .then(response => {
                    if (response[0] === ACK) {
                        if (this.replyMode) {
                            return this.serial.write(u8a([ACK]));
                        }
                        return Promise.resolve();
                    } else {
                        throw new Error('Unexpected response');
                    }
                })
                .then(() => {
                    logger.log('Bootloader is ready for commands');
                    resolve();
                })
                .catch(reject);
        });
    }

    /**
     * Resets the target by toggling a control pin defined in RESET_PIN
     * @private
     * @returns {Promise}
     */
    async resetTarget() {
        return new Promise((resolve, reject) => {
            logger.log('Resetting target...');
            let signal = {};

            if (!this.serial.isOpen()) {
                reject(new Error('Port must be opened for device reset'));
                return;
            }

            signal[RESET_PIN] = PIN_LOW;
            this.serial.control(signal)
                .then(() => {
                    signal[RESET_PIN] = PIN_HIGH;
                    return this.serial.control(signal);
                })
                .then(() => {
                    // wait for device init
                    logger.log('Reset done. Wait for init.');
                    this.ewrLoadState = EwrLoadState.NOT_LOADED;
                    setTimeout(resolve, 200);
                })
                .catch(reject);
        });
    }

    /**
     * Calcualtes the checksum (XOR) of the byte array.
     * @private
     * @param data Byte Array to calculate the checksum for.
     * @param {boolean} wLength If true takes the length of the array into the account (used for data write)
     * @returns {number} Calculated checksum
     */
    calcChecksum(data, wLength) {
        let result = 0;

        for (let i = 0; i < data.length; i += 1) {
            result = result ^ data[i];
        }

        if (wLength) {
            result = result ^ (data.length - 1);
        }

        return result;
    }
}
