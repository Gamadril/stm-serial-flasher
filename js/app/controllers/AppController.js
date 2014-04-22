/*global define */
define(['stapes', 'app/api/STMapi', 'app/api/ChromeSerial', 'app/models/Device', 'app/utils/Tools', 'app/models/Settings', 'app/views/MainView', 'app/views/SettingsView', 'app/api/FileApi'], function (Stapes, STM, Serial, Device, tools, settings, MainView, SettingsView, FileApi) {
    "use strict";
    return Stapes.subclass({
        stm: null,
        serial: null,
        mainView: null,
        settingsView: null,
        device: null,
        port: null,
        fileToFlash: null,
        stm8routines: null,
        fileApi: null,

        constructor: function () {
            this.serial = new Serial();
            this.stm = new STM(this.serial);
            this.mainView = new MainView();
            this.fileApi = new FileApi();
            this.settingsView = new SettingsView();
            this.device = new Device();

            this.bindEventHandlers();

            this.loadPortSettings();

            settings.getLastSelectedFile(function (entry) {
                var type;

                if (entry) {
                    type = tools.extension(entry.name);
                    if (!type) {
                        type = 'binary';
                    }

                    this.mainView.updateFooterFile(entry.fullLocalPath);
                    this.fileToFlash = {
                        fileEntry: entry,
                        type: type
                    };
                }
            }.bind(this), this.errorHandler.bind(this));
        },

        bindEventHandlers: function () {
            this.device.on({
                'change:family': function (value) {
                    this.mainView.updateDeviceFamily(value);

                    if (value === 'STM8') {
                        this.mainView.disableDeviceList(false);
                    } else if (value === 'STM32') {
                        this.mainView.disableDeviceList(true);
                    }
                },
                'change:blVersion': function (value) {
                    this.mainView.updateBlVersion(value);
                    var flash = this.device.get('flash');
                    if (flash) {
                        this.stm.setDevice({blVersion: value, flash: flash}, null, this.errorHandler.bind(this));
                    }
                },
                'change:flash': function (value) {
                    var blVersion = this.device.get('blVersion');
                    if (blVersion) {
                        this.stm.setDevice({blVersion: blVersion, flash: value}, null, this.errorHandler.bind(this));
                    }
                },
                'change:pid': function (value) {
                    this.mainView.updatePID(value);
                },
                'remove': function () {
                    this.mainView.updatePID('');
                    this.mainView.updateBlVersion('');
                    this.mainView.disableDeviceList(false);
                    this.mainView.updateDeviceFamily('');
                }
            }, this);

            this.settingsView.on({
                'portSelected': function (port) {
                    this.port.name = port;
                    settings.savePortSettings(this.port);
                    this.loadPortSettings();
                },
                'baudSelected': function (baud) {
                    this.port.baud = parseInt(baud, 10);
                    settings.savePortSettings(this.port);
                    this.loadPortSettings();
                },
                'replyMode': function (value) {
                    this.port.replyMode = value;
                    settings.savePortSettings(this.port);
                    this.loadPortSettings();
                }
            }, this);

            this.mainView.on({
                'settings': function () {
                    this.openSettings();
                },
                'openFile': function () {
                    this.fileApi.selectFile(function (fileEntry) {
                        var type = tools.extension(fileEntry.name);
                        if (!type) {
                            type = 'binary';
                        }

                        this.mainView.updateFooterFile(fileEntry.fullLocalPath);
                        this.fileToFlash = {
                            fileEntry: fileEntry,
                            type: type
                        };

                        settings.setLastSelectedFile(fileEntry);
                    }.bind(this), this.errorHandler.bind(this));
                },

                'deviceSelected': function (flashSize) {
                    if (flashSize === -1) {
                        return;
                    }

                    this.device.set('flash', flashSize);
                },

                'connect': this.connect.bind(this),

                'eraseAll': function () {
                    this.mainView.enableCmdButtons(false);

                    this.connect(function () {
                        this.mainView.logMessage('Erasing flash...');
                        this.stm.eraseAll(function () {
                            this.mainView.logMessage('Flash erased!');
                            this.mainView.enableCmdButtons(true);
                            this.stm.disconnect();
                        }.bind(this), this.errorHandler.bind(this));
                    }.bind(this));
                },

                'flash': function (go) {
                    this.fileApi.readFile(this.fileToFlash.fileEntry, this.fileToFlash.type, function (content) {
                        var record, records, recordsCount, startAddress, index = 1;

                        this.mainView.logMessage('Parsing file...');
                        if (this.fileToFlash.type === 's19') {
                            records = tools.parseSRec(true, this.stm.WRITE_BLOCK_SIZE, content);
                        } else if (this.fileToFlash.type === 'hex' ||
                            this.fileToFlash.type === 'ihx') {
                            records = tools.parseHex(true, this.stm.WRITE_BLOCK_SIZE, content);
                        }
                        recordsCount = tools.countData(records);

                        var flashRecord = function () {
                            record = records.shift();

                            if (!record) {
                                this.mainView.updateFlashProgress(0, 0);

                                if (go) {
                                    this.stm.cmdGO(startAddress, function () {
                                        this.stm.disconnect();
                                    }.bind(this), this.errorHandler.bind(this));
                                } else {
                                    this.stm.disconnect();
                                }
                                return;
                            }

                            this.mainView.updateFlashProgress(index, recordsCount);

                            if (record.type === 'data') {
                                this.mainView.logMessage('Writing block ' + index + '/' + recordsCount);
                                this.stm.write(record.data, record.address, function () {
                                    index++;
                                    flashRecord();
                                }.bind(this), this.errorHandler.bind(this));
                            } else if (record.type === 'start') {
                                this.mainView.logMessage('Start address detected: 0x' + record.address.toString(16));
                                startAddress = record.address;
                                flashRecord();
                            } else {
                                flashRecord();
                            }
                        }.bind(this);

                        this.connect(function () {
                            flashRecord();
                        }.bind(this));
                    }.bind(this));
                }
            }, this);
        },

        openSettings: function () {
            this.serial.listPorts(function (ports) {
                this.settingsView.fillPortsSelection(ports);

                settings.loadPortSettings(function (result) {
                    if (result && result.name) {
                        this.port = result;
                    } else {
                        this.port = {
                            baud: 115200,
                            parity: 'even',
                            replyMode: false
                        };
                    }
                    this.settingsView.selectPort(this.port.name);
                    this.settingsView.selectBaudRate(this.port.baud);
                    this.settingsView.setReplyMode(this.port.replyMode);
                    this.settingsView.show();
                }.bind(this), this.errorHandler.bind(this));
            }.bind(this), this.errorHandler.bind(this));
        },

        loadPortSettings: function () {
            this.stm.disconnect();
            settings.loadPortSettings(function (portSettings) {
                if (!(portSettings && portSettings.name)) {
                    this.openSettings();
                } else {
                    this.port = portSettings;
                }
            }.bind(this), this.errorHandler.bind(this));
        },

        errorHandler: function (error) {
            console.log(error);
            this.mainView.logMessage(error);
            this.stm.disconnect();
            this.reset();
        },

        reset: function () {
            this.mainView.enableCmdButtons(true);
            this.mainView.disableDeviceList(false);
            this.device.remove();
        },

        connect: function (onSuccess) {
            //this.reset();

            this.mainView.logMessage('Connecting to device...');
            this.stm.connect(this.port, function () {
                this.stm.cmdGET(function (deviceInfo) {
                    this.mainView.logMessage('Connection established.');
                    this.device.set('commands', deviceInfo.commands);
                    this.device.set('blVersion', deviceInfo.blVersion);

                    if (deviceInfo.commands.indexOf(this.stm.CMD_ID) === -1) { //STM8
                        this.mainView.logMessage('STM8 target detected');
                        this.device.set('family', 'STM8');

                        if (onSuccess) {
                            onSuccess();
                        }
                    } else { // STM32
                        this.mainView.logMessage('STM32 target detected');
                        this.device.set('family', 'STM32');
                        this.stm.cmdGID(function (pid) {
                            this.device.set('pid', pid);
                            if (onSuccess) {
                                onSuccess();
                            }
                        }.bind(this), this.errorHandler.bind(this));
                    }
                }.bind(this), this.errorHandler.bind(this));
            }.bind(this), this.errorHandler.bind(this));
        }
    });
});
