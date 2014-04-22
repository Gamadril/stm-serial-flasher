define(['stapes'], function (Stapes) {
    "use strict";
    var Tools = Stapes.subclass({

        /**
         * Parses the content of a s19 file
         * @param {boolean} combine Set to true to combine the data into packages
         * @param {number} blockSize Size of the block to combine data to
         * @param {string} fileContent Content of the s19 file
         * @param {function(string)} [onError] Error callback
         * @returns {Array} Array of single records
         */
        parseSRec: function (combine, blockSize, fileContent, onError) {
            var lines, i, line, record, checksum, records = [], type, addrLength;

            lines = fileContent.split("\n");
            for (i = 0; i < lines.length; i++) {
                line = lines[i];

                if (line.length === 0) { // skip empty lines
                    continue;
                } else if (line.charAt(0) !== 'S') {
                    if (onError) {
                        onError("Invalid SRecord file format");
                    }
                    return null;
                }

                record = {};
                type = parseInt(line.substr(1, 1), 10);
                record.type = null;
                if (type === 1) {
                    addrLength = 4;
                    record.type = 'data';
                } else if (type === 3) {
                    addrLength = 8;
                    record.type = 'data';
                } else if (type === 9) {
                    addrLength = 4;
                    record.type = 'start';
                } else if (type === 7) {
                    addrLength = 8;
                    record.type = 'start';
                } else {
                    continue;
                }
                record.length = parseInt(line.substr(2, 2), 16);
                record.address = parseInt(line.substr(4, addrLength), 16);
                record.data = this.hexstr2uintarray(line.substr(4 + addrLength, (record.length - 3) * 2));
                record.checksum = parseInt(line.substr(-2), 16);

                checksum = (this.sum(this.hexstr2uintarray(line.substring(2, line.length - 2))) & 0xFF) ^ 0xFF;

                if (checksum !== record.checksum) {
                    if (onError) {
                        onError("Checksum in line " + (i + 1) + " does not match");
                    }
                    return null;
                }

                records.push(record);
            }

            if (combine) {
                records = this.packRecords(records, blockSize);
            }

            return records;
        },

        /**
         * Parses the content of a hex file
         * @param {boolean} combine Set to true to combine the data into packages
         * @param {number} blockSize Size of the block to combine data to
         * @param {string} fileContent Content of the hex file
         * @param {function(string)} [onError] Error callback
         * @returns {Array} Array of single records
         */
        parseHex: function (combine, blockSize, fileContent, onError) {
            var lines, i, line, record, checksum, records = [], type, base = 0;

            lines = fileContent.split("\n");
            for (i = 0; i < lines.length; i++) {
                line = lines[i];

                if (line.length === 0) { // skip empty lines
                    continue;
                } else if (line.charAt(0) !== ':') {
                    if (onError) {
                        onError("Invalid HEX file format");
                    }
                    return null;
                }

                record = {};
                type = parseInt(line.substr(7, 2), 16);
                record.length = parseInt(line.substr(1, 2), 16);
                record.address = parseInt(line.substr(3, 4), 16);
                if (base > 0) {
                    record.address += base;
                }

                record.data = this.hexstr2uintarray(line.substr(9, record.length * 2));
                record.checksum = parseInt(line.substr(-2), 16);

                checksum = this.sum(this.hexstr2uintarray(line.substr(1))) % 256;

                if (checksum !== 0) {
                    if (onError) {
                        onError("Checksum in line " + (i + 1) + " does not match");
                    }
                    return null;
                }

                record.type = null;
                if (type === 0) {
                    record.type = 'data';
                    records.push(record);
                } else if (type === 4) {
                    base = record.data[0] << 24;
                    base += record.data[1] << 16;
                } else if (type === 5) {
                    record.type = 'start';
                    record.address = parseInt(line.substr(9, record.length * 2), 16);
                    records.push(record);
                }
            }

            if (combine) {
                records = this.packRecords(records, blockSize);
            }

            return records;
        },

        /**
         * @private
         * @param {Array} records Array of records to combine
         * @param {number} blockSize Size of the block to combine data to
         * @returns {Array} New recombined records
         */
        packRecords: function (records, blockSize) {
            var record, newRecord, result = [], startAddress, offset = 0, dataBuffer;

            var minAddress = function (records) {
                var record, i, result = -1;

                for (i = 0; i < records.length; i++) {
                    record = records[i];

                    if (result === -1 || result > record.address) {
                        result = record.address;
                    }
                }

                return result;
            };

            var findRecord = function (address) {
                var i;

                for (i = 0; i < records.length; i++) {
                    if (records[i].address === address && records[i].type === 'data') {
                        return records[i];
                    }
                }

                return null;
            };

            var findStartRecord = function() {
                var i;

                for (i = 0; i < records.length; i++) {
                    if (records[i].type === 'start') {
                        return records[i];
                    }
                }

                return null;
            };

            while (true) {
                newRecord = {
                    type: 'data'
                };

                record = findStartRecord();
                if (record) {
                    result.push(record);
                    records.splice(records.indexOf(record), 1);
                    continue;
                }

                startAddress = minAddress(records);

                if (startAddress === -1) {
                    break;
                }

                newRecord.address = startAddress;
                dataBuffer = new Uint8Array(blockSize);

                while ((record = findRecord(startAddress + offset)) !== null) {
                    if (offset + record.data.length > blockSize) {
                        break;
                    } else {
                        dataBuffer.set(record.data, offset);
                        records.splice(records.indexOf(record), 1);
                        offset += record.data.length;
                    }
                }

                if (offset < blockSize) {
                    dataBuffer = dataBuffer.subarray(0, offset);
                }

                offset = 0;
                newRecord.data = dataBuffer;

                result.push(newRecord);
            }

            return result;
        },

        /**
         * Returns the number of data records
         * @param {Array} records Array of records
         * @returns {number} Number of daa records
         */
        countData: function (records) {
            var i, result = 0;
            for (i = 0; i < records.length; i++) {
                if (records[i].type === 'data') {
                    result++;
                }
            }
            return result;
        },

        /**
         * Extracts the extension of a filename
         * @param {string} fileName Name of the file
         * @returns {string} Extension or null if file has no extension
         */
        extension: function (fileName) {
            var result = null, dotIndex = fileName.lastIndexOf('.');

            if (dotIndex !== -1) {
                result = fileName.substr(dotIndex + 1);
            }

            return result;
        },

        /**
         * Calculate the sum of bytes in the array
         * @private
         * @param {Uint8Array} array Array
         * @returns {number} Sum of all values in the array
         */
        sum: function (array) {
            var i, total = 0;
            for (i = 0; i < array.length; i++) {
                total += array[i];
            }
            return total;
        },

        /**
         * Convert a HEX string to Uint8Array
         * @private
         * @param {string} str String
         * @returns {Uint8Array} Result
         */
        hexstr2uintarray: function (str) {
            var result = new Uint8Array(str.length / 2);
            for (var i = 0; i < str.length / 2; i++) {
                result[i] = parseInt(str.substr(i * 2, 2), 16);
            }
            return result;
        },

        /**
         * Convert a string to ArrayBuffer
         * @private
         * @param {string} str String to convert
         * @returns {ArrayBuffer} Result
         */
        str2ab: function (str) {
            var buf = new ArrayBuffer(str.length);
            var bufView = new Uint8Array(buf);
            for (var i = 0; i < str.length; i++) {
                bufView[i] = str.charCodeAt(i);
            }
            return buf;
        },

        /**
         * Convert an array to ArrayBuffer
         * @private
         * @param array
         * @returns {ArrayBuffer} Result
         */
        a2ab: function (array) {
            var buf = new ArrayBuffer(array.length);
            var bufView = new Uint8Array(buf);
            for (var i = 0; i < array.length; i++) {
                bufView[i] = array[i];
            }
            return buf;
        },

        /**
         * Convert ArrayBuffer to array
         * @private
         * @param buffer
         * @returns {Uint8Array}
         */
        ab2a: function (buffer) {
            return new Uint8Array(buffer);
        },

        /**
         * Convert ArrayBuffer to string
         * @private
         * @param {ArrayBuffer} buffer Buffer to convert
         * @returns {string}
         */
        ab2hexstr: function (buffer) {
            var ua = new Uint8Array(buffer);
            var str = "";
            for (var i = 0; i < ua.length; i++) {
                str += this.b2hexstr(ua[i]);
            }
            return str;
        },

        /**
         * Convert byte to hexstr.
         * @param {number} byte Byte to convert
         */
        b2hexstr: function (byte) {
            return ("00" + byte.toString(16)).substr(-2);
        },

        /**
         * @private
         * @param buffer
         * @returns {string}
         */
        ab2str: function (buffer) {
            return String.fromCharCode.apply(null, new Uint8Array(buffer));
        },

        /**
         * @private
         * @param number
         * @param arraySize
         * @returns {Array}
         */
        num2a: function (number, arraySize) {
            var i, temp = number, result = [];

            for (i = 0; i < arraySize; i++) {
                result.unshift(temp & 0xFF);
                temp = temp >> 8;
            }

            return result;
        },

        /**
         * Convert an Uint8Array to array
         * @private
         * @param uiArray
         * @returns {Array}
         */
        uia2a: function (uiArray) {
            var i, result = [];

            for (i = 0; i < uiArray.length; i++) {
                result.push(uiArray[i]);
            }

            return result;
        }
    }, true);

    return new Tools();
});
