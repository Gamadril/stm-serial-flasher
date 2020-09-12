

export default class Serial {
    constructor() {
        this.init();
    }

    init() {
    }

    /**
     * Check if a connection is opened.
     */
    isOpen() {
        return false;
    }

    /**
     * Open the serial port
     * @param {Object} port Port object
     */
    open(port) {
    }

    /**
     * Close the current connection
     */
    close() {
    }

    /**
     * Read data from the serial port
     */
    read() {
    }

    /**
     * Writes data to serial port
     * @param {Uint8Array} data Data to send.
     */
    write(data) {
    }

    /**
     * Set the control signals of the current connection
     * @param {dtr:boolean, rts:boolean} lineParams signal parameters
     */
    control(lineParams) {
    }

    onConnect() {       
    }

    onDisconnect() {
    }
}
