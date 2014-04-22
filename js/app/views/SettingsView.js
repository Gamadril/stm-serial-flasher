
define(['stapes'], function (Stapes) {
    "use strict";
    return Stapes.subclass({
        constructor: function () {
            this.bindEventHandlers();
        },

        bindEventHandlers: function () {
            document.getElementById('comList').addEventListener('change', this.onComPortSelected.bind(this), false);
            document.getElementById('baudList').addEventListener('change', this.onBaudSelected.bind(this), false);
            document.getElementById('buttonClose').addEventListener('click', this.onButtonCloseClick.bind(this), false);
            document.getElementById('replyMode').addEventListener('change', this.onReplyModeChange.bind(this), false);
        },

        /**
         * @private
         */
        onButtonCloseClick: function () {
            this.close();
        },

        /**
         * @private
         * @param event
         */
        onComPortSelected: function (event) {
            var port = event.target.value;
            this.emit('portSelected', port);
        },

        /**
         * @private
         * @param event
         */
        onBaudSelected: function (event) {
            var baud = event.target.value;
            this.emit('baudSelected', baud);
        },

        /**
         * @private
         * @param event
         */
        onReplyModeChange: function (event) {
            var state = event.target.checked;
            this.emit('replyMode', state);
        },

        /**
         * @param ports
         */
        fillPortsSelection: function (ports) {
            var i, port, option, df;

            df = document.createDocumentFragment();

            for (i = 0; i < ports.length; i++) {
                port = ports[i].name;
                // OSX hack
                if (port.indexOf('/dev/cu') !== -1) {
                    continue;
                }
                option = document.createElement('option');
                option.innerHTML = port;
                option.value = port;
                df.appendChild(option);
            }

            document.getElementById('comList').innerHTML = '';
            document.getElementById('comList').appendChild(df);
        },

        /**
         *
         * @param port
         */
        selectPort: function (port) {
            document.getElementById('comList').value = port;
        },

        /**
         *
         * @param baud
         */
        selectBaudRate: function (baud) {
            document.getElementById('baudList').value = baud;
        },

        /**
         *
         * @param mode
         */
        setReplyMode: function (mode) {
            document.getElementById('replyMode').checked = mode;
        },

        /**
         * Show view
         */
        show: function () {
            document.getElementById('settings').classList.add('slideInDown');
        },

        /**
         * Close view
         */
        close: function () {
            document.getElementById('settings').classList.remove('slideInDown');
        }
    });
});

