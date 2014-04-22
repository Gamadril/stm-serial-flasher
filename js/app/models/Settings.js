/*global define, chrome */
define(['stapes'], function (Stapes) {
    "use strict";
    var Settings = Stapes.subclass({

        /**
         * Loads saved port settings
         * @param {function()} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        loadPortSettings: function (onSuccess, onError) {
            chrome.storage.local.get('portSettings', function (portEntry) {
                if (chrome.runtime.lastError) {
                    if (onError) {
                        onError(chrome.runtime.lastError.message);
                    }
                } else if (onSuccess) {
                    onSuccess(portEntry.portSettings);
                }
            });
        },

        /**
         * Save port settings
         * @param portSettings Port settings to save
         * @param {function()} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        savePortSettings: function (portSettings, onSuccess, onError) {
            chrome.storage.local.set({'portSettings': portSettings}, function () {
                if (chrome.runtime.lastError) {
                    if (onError) {
                        onError(chrome.runtime.lastError.message);
                    }
                } else if (onSuccess) {
                    onSuccess();
                }
            });
        },

        /**
         * Get last selected file for flashing
         * @param {function(fileEntry)} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        getLastSelectedFile: function (onSuccess, onError) {
            chrome.storage.local.get('lastSelectedFile', function (fileEntry) {
                var fileId;

                if (chrome.runtime.lastError) {
                    if (onError) {
                        onError(chrome.runtime.lastError.message);
                    }
                } else {
                    fileId = fileEntry.lastSelectedFile;
                    if (fileId) {
                        chrome.fileSystem.restoreEntry(fileId, function (entry) {
                            chrome.fileSystem.getDisplayPath(entry, function (path) {
                                entry.fullLocalPath = path;
                                entry.fileId = fileId;
                                if (onSuccess) {
                                    onSuccess(entry);
                                }
                            }.bind(this));
                        }.bind(this));
                    } else if (onSuccess) {
                        onSuccess(null);
                    }

                }
            }.bind(this));
        },

        /**
         * Save information about selected file
         * @param {fileEntry} entry File entry to save
         * @param {function()} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        setLastSelectedFile: function (entry, onSuccess, onError) {
            chrome.storage.local.set({'lastSelectedFile': entry.fileId}, function () {
                if (chrome.runtime.lastError) {
                    if (onError) {
                        onError(chrome.runtime.lastError.message);
                    }
                } else if (onSuccess) {
                    onSuccess();
                }
            });

        }
    }, true);

    return new Settings();
});
