/*global define */
define(['stapes', 'app/utils/Tools'], function (Stapes, tools) {
    "use strict";
    return Stapes.subclass({
        serial: null,
        port: null,

        RESET_PIN: "dtr",
        //BOOT0_PIN: "rts", // STM32

        SYNCHR: 0x7F,
        ACK: 0x79,
        NACK: 0x1F,

        /**
         * Address for erase_write_routines for STM8 S/A
         * @type number
         */
        STM8_WRITE_CODE_ADDRESS: 0xA0,

        // STM8 = 128, STM32 = 256
        WRITE_BLOCK_SIZE: 128,
        READ_BLOCK_SIZE: 256,

        stm8RoutinesFile: null,
        ewRoutines: null,

        /**
         * Indicates if the STM8 erase_write_routines are already loaded
         * @type {'no','sending','yes'}
         */
        ewrSent: 'no',

        /**
         * Activates the reply mode which is necessary for some STM8 MCUs
         */
        reply: false,

        /**
         * GET ID command used to identify the STM family. If it's present it's STM32, STM8 otherwise
         */
        CMD_ID: 0x02,

        commands: null,

        constructor: function (serial) {
            this.serial = serial;
        },

        /**
         * Connect to the target by resetting it and activating the ROM bootloader
         * @param {Object} port Port parameters
         * @param {function()} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        connect: function (port, onSuccess, onError) {
            this.ewrSent = 'no';
            this.WRITE_BLOCK_SIZE = 128;

            if (!this.serial.isOpen()) {
                this.port = port;
                this.reply = port.replyMode || false;

                if (!this.replyMode) {
                    this.port.parity = 'even';
                } else {
                    this.port.parity = 'no';
                }

                this.serial.open(this.port, function () {
                    this.connect(this.port, onSuccess, onError);
                }.bind(this), onError);
                return;
            }

            this.resetTarget(function () {
                this.activateBootloader(onSuccess, onError);
            }.bind(this), onError);
        },

        /**
         * Close current connection
         * @param {function()} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        disconnect: function (onSuccess, onError) {
            this.serial.close(onSuccess, onError);
        },

        /**
         * Serial read wrapper for single response with automatic echo mode
         * @private
         * @param {function(Uint8Array)} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        readResponse: function (onSuccess, onError) {
            this.serial.read(function (result) {
                if (this.reply) {
                    this.serial.write([result[0]], function () {
                        if (onSuccess) {
                            onSuccess(result);
                        }
                    }, onError);
                } else {
                    if (onSuccess) {
                        onSuccess(result);
                    }
                }
            }.bind(this), onError);
        },

        /**
         * Execute GO command
         * @param {number} address Memory address to start code execution
         * @param {function()} [onSuccess] Callback to call on success
         * @param {function()} [onError] Callback to call on error
         */
        cmdGO: function (address, onSuccess, onError) {
            var aAddressFrame;

            if (!this.serial.isOpen()) {
                if (onError) {
                    onError('Connection must be established before sending commands');
                }
                return;
            }

            aAddressFrame = tools.num2a(address, 4);
            aAddressFrame.push(this.calcChecksum(aAddressFrame, false));

            this.serial.write([0x21, 0xDE], function () { // -> 0x21DE
                this.readResponse(function (result) { // <- ACK
                    if (result[0] === this.ACK) {
                        this.serial.write(aAddressFrame, function () {
                            this.readResponse(function (result) { // <- ACK
                                if (result[0] === this.ACK) {
                                    if (onSuccess) {
                                        onSuccess();
                                    }
                                } else if (onError) {
                                    onError('Unexpected response');
                                }
                            }.bind(this), onError);
                        }.bind(this), onError);
                    } else if (onError) {
                        onError('Unexpected response');
                    }
                }.bind(this), onError);
            }.bind(this), onError);
        },

        /**
         * Execute single READ command
         * @param {number} address Memory address to read from
         * @param bytesCount Number of bytes to read
         * @param {function(Uint8Array)} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        cmdREAD: function (address, bytesCount, onSuccess, onError) {
            var aAddressFrame;

            if (!this.serial.isOpen()) {
                if (onError) {
                    onError('Connection must be established before sending commands');
                }
                return;
            }

            if (address === null || address === undefined) {
                if (onError) {
                    onError('Missing address to read from');
                }
                return;
            }

            if (bytesCount === undefined || bytesCount <= 0 || bytesCount > this.READ_BLOCK_SIZE) {
                if (onError) {
                    onError('Wrong number of bytes to read');
                }
                return;
            }

            aAddressFrame = tools.num2a(address, 4);
            aAddressFrame.push(this.calcChecksum(aAddressFrame, false));

            this.serial.write([0x11, 0xEE], function () { // -> 0x11EE
                this.readResponse(function (result) { // <- ACK
                    if (result[0] === this.ACK) {
                        this.serial.write(aAddressFrame, function () {
                            this.readResponse(function (result) { // <- ACK
                                if (result[0] === this.ACK) {
                                    this.serial.write([bytesCount - 1, (bytesCount - 1) ^ 0xFF], function () { // The number of bytes to be read -1 (0 <= N <= 255)
                                        this.readResponse(function (result) { // <- ACK
                                            if (result[0] === this.ACK) {
                                                if (this.replyMode) {
                                                    var data = new Uint8Array(bytesCount), index = 0;

                                                    var doRead = function (onSuccess, onError) {
                                                        if (index === bytesCount) {

                                                            if (onSuccess) {
                                                                onSuccess(data);
                                                            }
                                                            return;
                                                        }

                                                        this.readResponse(function (result) { // <- get supported commands
                                                            data.set(index, result[0]);
                                                            index++;
                                                            doRead(onSuccess, onError);
                                                        }.bind(this), onError);
                                                    }.bind(this);
                                                    doRead(onSuccess, onError);
                                                } else {
                                                    if (onSuccess) {
                                                        onSuccess(result.subarray(1));
                                                    }
                                                }
                                            } else if (onError) {
                                                onError('Unexpected response');
                                            }
                                        }.bind(this), onError);
                                    }.bind(this), onError);
                                } else if (onError) {
                                    onError('Unexpected response');
                                }
                            }.bind(this), onError);
                        }.bind(this), onError);
                    } else if (onError) {
                        onError('Unexpected response');
                    }
                }.bind(this), onError);
            }.bind(this), onError);
        },

        /**
         * Execute Write Unprotect command
         * STM32 only
         * @param {function()} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        cmdWPUN: function (onSuccess, onError) {
            if (!this.serial.isOpen()) {
                if (onError) {
                    onError('Connection must be established before sending commands');
                }
                return;
            }

            if (this.commands && this.commands.indexOf(0x73) === -1) {
                if (onError) {
                    onError('Write Unprotect command is not supported by the current target');
                }
                return;
            }

            this.serial.write([0x73, 0x8C], function () {
                this.readResponse(function (result) { // <- ACK
                    if (result[0] === this.ACK) {
                        this.readResponse(function (result) { // <- ACK
                            if (result[0] === this.ACK) {
                                if (onSuccess) {
                                    onSuccess();
                                }
                            } else if (result[0] === this.NACK) {
                                if (onError) {
                                    onError('NACK received');
                                }
                            }
                        }.bind(this), onError);
                    }
                }.bind(this), onError);
            }.bind(this), onError);
        },

        /**
         * Execute Readout Unprotect command
         * STM32 only
         * @param {function()} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        cmdRPUN: function (onSuccess, onError) {
            if (!this.serial.isOpen()) {
                if (onError) {
                    onError('Connection must be established before sending commands');
                }
                return;
            }

            if (this.commands && this.commands.indexOf(0x92) === -1) {
                if (onError) {
                    onError('Readout Unprotect command is not supported by the current target');
                }
                return;
            }

            this.serial.write([0x92, 0x6D], function () {
                this.readResponse(function (result) { // <- ACK
                    if (result[0] === this.ACK) {
                        this.readResponse(function (result) { // <- ACK
                            if (result[0] === this.ACK) {
                                if (onSuccess) {
                                    onSuccess();
                                }
                            } else if (result[0] === this.NACK) {
                                if (onError) {
                                    onError('NACK received');
                                }
                            }
                        }.bind(this), onError);
                    }
                }.bind(this), onError);
            }.bind(this), onError);
        },

        /**
         * Execute single WRITE command
         * @param {Array} data Data to write
         * @param {number} address Address to write at
         * @param {function()} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        cmdWRITE: function (data, address, onSuccess, onError) {
            var frame = [], checksum, aAddressFrame;

            if (!data) {
                if (onError) {
                    onError('Missing data to write');
                }
                return;
            }

            if (address === null || address === undefined) {
                if (onError) {
                    onError('Missing address to write at');
                }
                return;
            }

            if (data.length > this.WRITE_BLOCK_SIZE) {
                if (onError) {
                    onError('Data is too big, use write()');
                }
                return;
            }

            if (!this.serial.isOpen()) {
                if (onError) {
                    onError('Connection must be established before sending commands');
                }
                return;
            }

            if (!this.commands) {
                if (onError) {
                    onError('Execute GET command first');
                }
                return;
            }

            if (this.ewrSent === 'no') {
                this.sendEWR(function () {
                    this.cmdWRITE(data, address, onSuccess, onError);
                }.bind(this), onError);
                return;
            }

            checksum = this.calcChecksum(data, true);

            frame.push(data.length - 1);
            frame = frame.concat(tools.uia2a(data));
            frame.push(checksum);

            aAddressFrame = tools.num2a(address, 4);
            aAddressFrame.push(this.calcChecksum(aAddressFrame, false));

            this.serial.write([0x31, 0xCE], function () { // -> 0x31CE
                this.readResponse(function (result) { // <- ACK
                    if (result[0] === this.ACK) {
                        this.serial.write(aAddressFrame, function () {
                            this.readResponse(function (result) { // <- ACK
                                if (result[0] === this.ACK) {
                                    this.serial.write(frame, function () {
                                        this.readResponse(function (result) { // <- ACK
                                            if (result[0] === this.ACK) {
                                                onSuccess();
                                            } else if (onError) {
                                                onError('Unexpected response');
                                            }
                                        }.bind(this), onError);
                                    }.bind(this), onError);
                                } else if (onError) {
                                    onError('Unexpected response');
                                }
                            }.bind(this), onError);
                        }.bind(this), onError);
                    } else if (onError) {
                        onError('Unexpected response');
                    }
                }.bind(this), onError);
            }.bind(this), onError);
        },

        /**
         * Write data to memory
         * @param {Uint8Array} data Data to write
         * @param {number} address Address to write at
         * @param {function()} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        write: function (data, address, onSuccess, onError) {
            var i, blocks = [], blocksCount, block, offset;

            if (!this.serial.isOpen()) {
                if (onError) {
                    onError('Connection must be established before sending commands');
                }
                return;
            }

            blocksCount = Math.floor(data.byteLength / this.WRITE_BLOCK_SIZE);
            if (data.byteLength % this.WRITE_BLOCK_SIZE > 0) {
                blocksCount++;
            }

            offset = 0;
            for (i = 0; i < blocksCount; i++) {
                block = {};

                if (i < blocksCount - 1) {
                    block.data = data.subarray(offset, offset + this.WRITE_BLOCK_SIZE);
                } else {
                    block.data = data.subarray(offset);
                }
                offset += block.data.length;
                blocks.push(block);
            }

            var blockWrite = function (address, onSuccess, onError) {
                block = blocks.shift();

                if (block) {
                    this.cmdWRITE(block.data, address, function () {
                        blockWrite(address + block.data.length, onSuccess, onError);
                    }.bind(this), onError);
                } else if (onSuccess) {
                    onSuccess();
                }
            }.bind(this);

            blockWrite(address, onSuccess, onError);
        },

        /**
         * Do a full erase of the flash
         * @param {function()} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        eraseAll: function (onSuccess, onError) {
            var eraseCmd, eraseFlash;

            if (!this.serial.isOpen()) {
                if (onError) {
                    onError('Connection must be established before sending commands');
                }
                return;
            }

            if (this.ewrSent === 'no') {
                this.sendEWR(function () {
                    this.eraseAll(onSuccess, onError);
                }.bind(this), onError);
                return;
            }

            if (!this.commands) {
                if (onError) {
                    onError('Execute GET command first');
                }
                return;
            }

            if (this.commands.indexOf(0x43) !== -1) {
                eraseCmd = [0x43, 0xBC];
                eraseFlash = [0xFF, 0x00];
            } else if (this.commands.indexOf(0x44) !== -1) {
                eraseCmd = [0x44, 0xBB];
                eraseFlash = [0xFF, 0xFF, 0x00];
            } else {
                if (onError) {
                    onError('No erase command found');
                }
                return;
            }

            this.serial.write(eraseCmd, function () {
                this.readResponse(function (result) { // <- ACK
                    if (result[0] === this.ACK) {
                        this.serial.write(eraseFlash, function () {
                            this.readResponse(function (result) { // <- ACK
                                if (result[0] === this.ACK) {
                                    if (onSuccess) {
                                        onSuccess();
                                    }
                                } else if (result[0] === this.NACK) {
                                    if (onError) {
                                        onError('NACK received');
                                    }
                                }
                            }.bind(this), onError);
                        }.bind(this), onError);
                    }
                }.bind(this), onError);
            }.bind(this), onError);
        },

        /**
         * Writes erase_write_routines for STM8 A/S to RAM. All erase7write operations won't work without them
         * @private
         * @param {function()} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        sendEWR: function (onSuccess, onError) {
            var xhr;

            if (!this.ewRoutines) {
                if (!this.stm8RoutinesFile) {
                    if (onError) {
                        onError('Select your device first');
                    }
                } else {
                    xhr = new XMLHttpRequest();
                    xhr.onerror = function () {
                        if (onError) {
                            onError('Unsupported device (flash/bootloader combination)');
                        }
                    };
                    xhr.onreadystatechange = function () {
                        if (xhr.readyState === xhr.DONE) {
                            xhr.onreadystatechange = null;
                            if (xhr.response) {
                                this.ewRoutines = new Uint8Array(xhr.response);
                                this.sendEWR(onSuccess, onError);
                            }
                        }
                    }.bind(this);


                    xhr.open("GET", chrome.runtime.getURL(this.stm8RoutinesFile), true);
                    xhr.responseType = 'arraybuffer';
                    xhr.send();
                }
                return;
            }

            this.ewrSent = 'sending';
            this.write(this.ewRoutines, this.STM8_WRITE_CODE_ADDRESS, function () {
                this.ewrSent = 'yes';
                if (onSuccess) {
                    onSuccess();
                }
            }.bind(this), function (error) {
                this.ewrSent = 'no';
                if (onError) {
                    onError(error);
                }
            }.bind(this));
        },

        /**
         * Execute Get ID command
         * STM32 only
         * @param {function(string)} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        cmdGID: function (onSuccess, onError) {
            if (!this.serial.isOpen()) {
                if (onError) {
                    onError('Connection must be established before sending commands');
                }
                return;
            }

            if (this.commands && this.commands.indexOf(0x02) === -1) {
                if (onError) {
                    onError('GET ID command is not supported by the current target');
                }
                return;
            }

            this.serial.write([0x02, 0xFD], function () { // -> 0x00FF
                this.readResponse(function (result) { // <- ACK
                    var pid;
                    if (result[0] === this.ACK) {
                        pid = "0x" + tools.b2hexstr(result[2]) + tools.b2hexstr(result[3]);
                        if (onSuccess) {
                            onSuccess(pid);
                        }
                    } else if (onError) {
                        onError('Unexpected response');
                    }
                }.bind(this), onError);
            }.bind(this), onError);
        },

        /**
         * @typedef {object} infoGV
         * @property {string} blVersion - Bootloader version.
         * @property {number} countRPenabled - Number of times the read protection was enabled
         * @property {number} countRPdisabled - Number of times the read protection was disabled
         */

        /**
         * Get Version & Read Protection Status command
         * STM32 only
         * @param {function(infoGV)} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        cmdGV: function (onSuccess, onError) {
            if (!this.serial.isOpen()) {
                if (onError) {
                    onError('Connection must be established before sending commands');
                }
                return;
            }

            if (this.commands && this.commands.indexOf(0x01) === -1) {
                if (onError) {
                    onError('Get Version & Read Protection Status command is not supported by the current target');
                }
                return;
            }

            this.serial.write([0x01, 0xFE], function () { // -> 0x01FE
                this.readResponse(function (result) { // <- ACK
                    var info;

                    if (result[0] === this.ACK) {
                        info = {};
                        info.blVersion = (result[1] >> 4) + '.' + (result[1] & 0x0F);
                        info.countRPenabled = result[2];
                        info.countRPdisabled = result[3];

                        if (onSuccess) {
                            onSuccess(info);
                        }
                    } else if (onError) {
                        onError('Unexpected response');
                    }
                }.bind(this), onError);
            }.bind(this), onError);
        },

        /**
         * @typedef {object} deviceInfoGet
         * @property {string} blVersion - Bootloader version.
         * @property {number[]} commands - List of supported command
         */

        /**
         * Executes GET command
         * @param {function(deviceInfoGet)} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        cmdGET: function (onSuccess, onError) {
            var info = {
                blVersion: 0,
                commands: []
            };

            if (!this.serial.isOpen()) {
                if (onError) {
                    onError('Connection must be established before sending commands');
                }
                return;
            }

            this.serial.write([0x00, 0xFF], function () { // -> 0x00FF
                this.readResponse(function (result) { // <- ACK
                    var i;
                    if (result[0] === this.ACK) {
                        if (!this.reply) {
                            info.blVersion = (result[2] >> 4) + '.' + (result[2] & 0x0F);
                            for (i = 0; i < result[1]; i++) {
                                info.commands.push(result[3 + i]);
                            }

                            this.commands = info.commands;
                            if (this.commands.indexOf(this.CMD_ID) !== -1) {
                                this.ewrSent = 'yes';
                            }

                            if (onSuccess) {
                                onSuccess(info);
                            }
                        } else {
                            this.readResponse(function (result) { // <-  the number of bytes to be sent -1 (1 <= N +1 <= 256)
                                var cmdCount = result[0];
                                this.readResponse(function (result) { // <- BL version
                                    info.blVersion = (result[0] >> 4) + '.' + (result[0] & 0x0F);

                                    var doRead = function (onSuccess, onError) {
                                        if (cmdCount === 0) {
                                            // get the final ACK
                                            this.readResponse(function (result) { // <- ACK
                                                if (result[0] === this.ACK) {
                                                    this.commands = info.commands;

                                                    if (onSuccess) {
                                                        onSuccess(info);
                                                    }
                                                } else if (onError) {
                                                    onError('Unexpected response');
                                                }
                                            }.bind(this), onError);
                                            return;
                                        }
                                        cmdCount--;
                                        this.readResponse(function (result) { // <- get supported commands
                                            info.commands.push(result[0]);
                                            doRead(onSuccess, onError);
                                        }.bind(this), onError);
                                    }.bind(this);
                                    doRead(onSuccess, onError);
                                }.bind(this), onError);
                            }.bind(this), onError);
                        }
                    } else if (onError) {
                        onError('Unexpected response');
                    }
                }.bind(this), onError);
            }.bind(this), onError);
        },

        /**
         * Activate the ROM bootloader
         * @private
         * @param {function} [onSuccess] Callback to call on success
         * @param {function} [onError] Callback to call on error
         */
        activateBootloader: function (onSuccess, onError) {
            if (!this.serial.isOpen()) {
                if (onError) {
                    onError('Port must be opened before activating the bootloader');
                }
                return;
            }

            this.resetTarget(function () {
                this.serial.write([this.SYNCHR], function () {
                    this.serial.read(function (result) {
                        if (result[0] === this.ACK) {
                            if (this.reply) {
                                this.serial.write([this.ACK], function () {
                                    if (onSuccess) {
                                        onSuccess();
                                    }
                                }, onError);
                            } else if (onSuccess) {
                                onSuccess();
                            }
                        } else if (onError) {
                            onError('Unexpected response');
                        }
                    }.bind(this), onError);
                }.bind(this), onError);
            }.bind(this), onError);
        },

        /**
         * Resets the target by toggling a control pin defined in RESET_PIN
         * @private
         * @param {function} [onSuccess] Callback to call on success
         * @param {function} [onError] Callback to call on error
         */
        resetTarget: function (onSuccess, onError) {
            var signal = {};

            if (!this.serial.isOpen()) {
                if (onError) {
                    onError('Port must be opened for device reset');
                }
                return;
            }

            signal[this.RESET_PIN] = true;
            this.serial.control(signal, function () {
                signal[this.RESET_PIN] = false;

                this.serial.control(signal, function () {
                    if (onSuccess) {
                        // wait for device init
                        setTimeout(onSuccess, 200);
                    }
                }, onError);
            }.bind(this), onError);
        },

        /**
         * Calcualtes the checksum (XOR) of the byte array.
         * @private
         * @param data Byte Array to calculate the checksum for.
         * @param {boolean} wLength If true takes the length of the array into the account (used for data write)
         * @returns {number} Calculated checksum
         */
        calcChecksum: function (data, wLength) {
            var i, result = 0;

            for (i = 0; i < data.length; i += 1) {
                result = result ^ data[i];
            }

            if (wLength) {
                result = result ^ (data.length - 1);
            }

            return result;
        },

        /**
         * Initializes erase_write_routines for STM8 S/A
         * @param {flash:"0"|"32"|"128"|"256", blVersion:string} device Flash size of the target MCU
         * @param {function} [onSuccess] Callback to call on success
         * @param {function} [onError] Callback to call on error
         */
        setDevice: function (device, onSuccess, onError) {
            this.ewrSent = 'no';

            if (!device.blVersion || device.flash === undefined) {
                return;
            }

            if (device.flash === '0') { // STM8 L
                this.ewrSent = 'yes';
                return;
            } else if (device.flash !== "32" && device.flash !== "128" && device.flash !== "256") {
                if (onError) {
                    onError("Unsupported device selected: " + device);
                }
                return;
            }

            this.stm8RoutinesFile = 'res/stm8_routines/E_W_ROUTINEs_' + device.flash + 'K_ver_' + device.blVersion + '.bin';
        }
    }, true);
});
