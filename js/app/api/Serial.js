/*global define */
define(['stapes'], function (Stapes) {
    "use strict";
    return Stapes.subclass({
        constructor: function () {
            this.init();
        },

        init: function () {

        },

        /**
         * Check if a connection is opened.
         */
        isOpen: function () {
            return false;
        },

        /**
         * Get the list of available serial ports
         * @param {function(ports)} [onSuccess] Callback to call on success
         * @param {function(error:string)} [onError] Callback to call on error
         */
        listPorts: function (onSuccess, onError) {
        },

        /**
         * Open the serial port
         * @param {Object} port Port object
         * @param {function} [onSuccess] Callback to call on success
         * @param {function(error:string)} [onError] Callback to call on error
         */
        open: function (port, onSuccess, onError) {
        },

        /**
         * Close the current connection
         * @param {function} [onSuccess] Callback to call on success
         * @param {function(error:string)} [onError] Callback to call on error
         */
        close: function (onSuccess, onError) {
        },

        /**
         * Read data from the serial port
         * @param {function} [onSuccess] Callback to call on success
         * @param {function(error:string)} [onError] Callback to call on error
         */
        read: function (onSuccess, onError) {
        },

        /**
         * Writes data to serial port
         * @param {string | Array} data Data to send.
         * @param {function} [onSuccess] Callback to call if data was sent successfully
         * @param {function(error:string)} [onError] Callback to call on error
         */
        write: function (data, onSuccess, onError) {
        },

        /**
         * Set the control signals of the current connection
         * @param {dtr:boolean, rts:boolean} lineParams signal parameters
         * @param {function()} [onSuccess] Callback function called on success
         * @param {function(error:string)} [onError] Callback function called on error
         */
        control: function (lineParams, onSuccess, onError) {
        }
    }, true);
});
