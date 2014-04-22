/*global define, chrome */
define(['stapes', 'app/api/Serial', 'app/utils/Tools'], function (Stapes, Serial, tools) {
    "use strict";
    return Serial.subclass({
        DEBUG: true,

        /**
         * @type {number}
         */
        handle: null,

        /**
         * @type {function}
         */
        currentResponseCallback: null,

        /**
         * @type {function}
         */
        currentErrorCallback: null,

        /**
         * Temporary buffer for incoming data
         */
        inputBuffer: null,
        inputBufferIndex: 0,
        readBufferTimerId: null,

        /**
         * @constructor
         */
        constructor: Serial.prototype.constructor,

        init: function () {
            this.inputBuffer = new Uint8Array(512);
            this.inputBufferIndex = 0;

            chrome.serial.onReceive.addListener(this.onDataReceived.bind(this));
            chrome.serial.onReceiveError.addListener(this.onError.bind(this));
        },

        isOpen: function () {
            return (this.handle !== null);
        },

        listPorts: function (onSuccess, onError) {
            chrome.serial.getDevices(function (foundPorts) {
                var i, port, ports = [];

                if (!foundPorts || foundPorts.length === 0) {
                    if (onError) {
                        onError('Could not detect any ports.');
                    }
                    return;
                }

                for (i = 0; i < foundPorts.length; i += 1) {
                    if (this.DEBUG) {
                        console.log('PORT: ' + foundPorts[i].path);
                    }
                    port = {name: foundPorts[i].path};
                    ports.push(port);
                }

                if (onSuccess) {
                    onSuccess(ports);
                }
            }.bind(this));
        },

        open: function (port, onSuccess, onError) {
            chrome.serial.connect(port.name, {
                    bitrate: port.baud,
                    parityBit: port.parity
                },
                function (connectionInfo) {
                    if (!connectionInfo) {
                        if (onError) {
                            onError("Could not open port " + port.name);
                        }
                        return;
                    }

                    this.handle = connectionInfo.connectionId;

                    if (this.handle !== -1) {
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        if (onError) {
                            onError("Failed to open port " + port.name);
                        }
                    }
                }.bind(this)
            );
        },

        close: function (onSuccess, onError) {
            if (this.handle) {
                chrome.serial.disconnect(this.handle, function (result) {
                    if (result) {
                        this.handle = null;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else if (onError) {
                        onError('Could not close port.');
                    }
                }.bind(this));
            }
        },

        write: function (data, onSuccess, onError) {
            var dataToSend = null;
            var dataType = typeof (data);

            if (!this.handle) {
                onError('Port is closed');
                return;
            }

            if (dataType === "string") {
                if (this.DEBUG) {
                    console.log("> " + data);
                }
                dataToSend = tools.str2ab(data);
            } else {
                if (this.DEBUG) {
                    console.log("> " + tools.ab2hexstr(data));
                }
                dataToSend = data;
            }

            chrome.serial.send(this.handle, tools.a2ab(dataToSend), function (sendInfo) {
                if (sendInfo.error && onError) {
                    onError(sendInfo.error);
                } else if (sendInfo.bytesSent > 0 && onSuccess) {
                    onSuccess();
                }
            });
        },

        read: function (onSuccess, onError) {
            if (!this.handle) {
                onError('Port is closed');
                return;
            }

            if (onSuccess) {
                this.currentResponseCallback = onSuccess;
            }

            if (onError) {
                this.currentErrorCallback = onError;
            }
        },

        control: function (lineParams, onSuccess, onError) {
            if (!this.handle) {
                onError('Port is closed');
                return;
            }

            chrome.serial.setControlSignals(this.handle, lineParams, function (result) {
                if (result && onSuccess) {
                    onSuccess();
                } else if (onError) {
                    onError('Could not set control signals.');
                }
            });
        },

        /**
         * Data receiption callback
         * @private
         * @param info
         */
        onDataReceived: function (info) {
            if (info.connectionId === this.handle && info.data) {
                if (this.readBufferTimerId) {
                    clearTimeout(this.readBufferTimerId);
                }
                this.inputBuffer.set(new Uint8Array(info.data), this.inputBufferIndex);
                this.inputBufferIndex += info.data.byteLength;

                if (this.DEBUG) {
                    console.log('< ' + tools.ab2hexstr(info.data));
                }

                if (this.currentResponseCallback) {
                    this.readBufferTimerId = setTimeout(function () {
                        this.currentResponseCallback(this.inputBuffer.subarray(0, this.inputBufferIndex));
                        this.inputBufferIndex = 0;
                    }.bind(this), 50);
                }
            }
        },

        /**
         * Error callback
         * @private
         * @param info
         */
        onError: function (info) {
            if (this.DEBUG) {
                console.log('[ERROR]: ' + info.error);
            }

            if (info.connectionId === this.handle && info.error) {
                if (this.currentErrorCallback) {
                    this.currentErrorCallback(info.error);
                    this.currentErrorCallback = null;
                }
            }
        }
    }, true);
});
