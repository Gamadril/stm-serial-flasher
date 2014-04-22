/*global chrome, define */
define(['stapes'], function (Stapes) {
    "use strict";
    return Stapes.subclass({

        /**
         * Show open file dialog for selecting a file
         * @param {function(entry)} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        selectFile: function (onSuccess, onError) {
            chrome.fileSystem.chooseEntry({
                type: "openFile",
                accepts: [
                    {extensions: ['s19', 'hex', 'ihx']}
                ]
            }, function (entry) {
                var fileId;

                if (chrome.runtime.lastError) {
                    if (onError) {
                        onError("File select: " + chrome.runtime.lastError.message);
                    }
                } else {
                    fileId = chrome.fileSystem.retainEntry(entry);
                    chrome.fileSystem.getDisplayPath(entry, function (path) {
                        entry.fullLocalPath = path;
                        entry.fileId = fileId;
                        if (onSuccess) {
                            onSuccess(entry);
                        }
                    });
                }
            });
        },

        /**
         * Read the content of a file
         * @param entry File entry
         * @param {"s19"|"hex"|"binary"} type File type
         * @param {function(*)} [onSuccess] Callback to call on success
         * @param {function(string)} [onError] Callback to call on error
         */
        readFile: function (entry, type, onSuccess, onError) {
            entry.file(function (file) {
                var reader = new FileReader();

                reader.onerror = function (error) {
                    if (onError) {
                        onError("File read: " + error);
                    }
                }.bind(this);
                reader.onloadend = function (e) {
                    if (onSuccess) {
                        onSuccess(e.target.result);
                    }
                }.bind(this);

                if (type === 's19' || type === 'hex' || type === 'ihx') {
                    reader.readAsText(file);
                } else if (type === 'binary') {
                    reader.readAsArrayBuffer(file);
                }
            });
        }
    }, true);
});
