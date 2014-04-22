define(['stapes'], function (Stapes) {
    "use strict";
    return Stapes.subclass({
        constructor: function () {
            this.bindEventHandlers();
        },

        bindEventHandlers: function () {
            document.getElementById('buttonOpenFile').addEventListener('click', this.onButtonOpenFileClick.bind(this), false);
            document.getElementById('buttonConnect').addEventListener('click', this.onButtonConnectClick.bind(this), false);
            document.getElementById('buttonEraseAll').addEventListener('click', this.onButtonEraseAllClick.bind(this), false);
            document.getElementById('devices').addEventListener('change', this.onDeviceSelected.bind(this), false);
            document.getElementById('buttonFlash').addEventListener('click', this.onButtonFlashClick.bind(this), false);
            document.getElementById('buttonFlashAndGo').addEventListener('click', this.onButtonFlashAndGoClick.bind(this), false);
            document.getElementById('buttonSettings').addEventListener('click', this.onButtonSettingsClick.bind(this), false);
        },

        onButtonOpenFileClick: function () {
            this.emit('openFile');
        },

        onDeviceSelected: function (event) {
            var device = event.target.value;
            this.emit('deviceSelected', device);
        },

        updateFooterFile: function (fileName) {
            document.getElementById('fileName').innerHTML = fileName;
        },

        updateDeviceFamily: function (value) {
            document.getElementById('deviceFamily').innerHTML = value;
        },

        updateBlVersion: function (value) {
            document.getElementById('blVersion').innerHTML = value;
        },

        updatePID: function(value) {
            document.getElementById('pid').innerHTML = value;
        },

        onButtonConnectClick: function () {
            this.emit('connect');
        },

        onButtonEraseAllClick: function () {
            this.emit('eraseAll');
        },

        onButtonFlashClick: function () {
            this.emit('flash', false);
        },

        onButtonFlashAndGoClick: function () {
            this.emit('flash', true);
        },

        enableCmdButtons: function (value) {
            document.getElementById('buttonEraseAll').disabled = !value;
            document.getElementById('buttonFlash').disabled = !value;
            document.getElementById('buttonFlashAndGo').disabled = !value;
        },

        disableDeviceList: function (value) {
            var list = document.getElementById('devices');
            list.disabled = value;
            if (value){
                list.parentNode.classList.add('hidden');
                list.selectedIndex = 0;
            } else{
                list.parentNode.classList.remove('hidden');
            }
        },

        updateFlashProgress: function (value, max) {
            var progressBar = document.getElementById('progressBar');
            progressBar.setAttribute('value', value);
            progressBar.setAttribute('max', max);
        },

        logMessage: function (message) {
            var li = document.createElement('li'),
                list = document.getElementById("logList");

            li.innerHTML = message;
            list.appendChild(li);
            list.parentNode.scrollTop = list.parentNode.scrollHeight;
        },

        onButtonSettingsClick: function () {
            this.emit('settings');
        }
    });
});

