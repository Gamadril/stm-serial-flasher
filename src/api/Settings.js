const REPLY_MODE = 'reply_mode';
const BAUDRATE = 'baudrate';
const START_ADDRESS = 'start_address';

class Settings {
    constructor() {
        this._replyMode = localStorage.getItem(REPLY_MODE) === "true" || false;
        this._baudrate = localStorage.getItem(BAUDRATE) || "9600";
        this._startAddress = localStorage.getItem(START_ADDRESS) || "0x8000000";
    }

    set replyMode(reply) {
        this._replyMode = reply;
        this.commit();
    }

    get replyMode() {
        return this._replyMode;
    }

    set baudrate(baudrate) {
        this._baudrate = baudrate;
        this.commit();
    }

    get baudrate() {
        return this._baudrate;
    }

    get startAddress() {
        return this._startAddress;
    }

    set startAddress(address) {
        this._startAddress = address;
        this.commit();
    }

    commit() {
        localStorage.setItem(REPLY_MODE, this._replyMode);
        localStorage.setItem(BAUDRATE, this._baudrate);
        localStorage.setItem(START_ADDRESS, this._startAddress);
    }
}

const settings = new Settings();

export default settings;