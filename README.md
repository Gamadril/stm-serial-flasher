STM serial flasher
==================

STM serial flasher is a Chrome App for programming the STM controllers using the embedded ROM bootloader over a serial port.
Currently the app supports STM8 and STM32 microcontrollers. Tests were done on the STM8-Discovery Board and STM32f4 Discovery Board.

The path to the last opened file is persistent, so it is not necessary to select it on each start.

Requirements
------------
Chrome 33

Installation
------------
Open chrome://extensions/ in Chrome and press "Load unpacked extension...". Select the folder containing the checked out app and confirm the selection. Start it from the extension list or from the chrome apps container.

Device connection
-----------------
Connect the device to your PC using a TTL level shifter.

| Device  | Host |
| ------- | ---- |
| GND  | GND  |
| TX | RX |
| RX | TX |
| NRST | DTR |


3rd party components
--------------------
Icons:
[SMD 64 pin Icon](http://www.iconarchive.com/show/electronics-icons-by-double-j-design/SMD-64-pin-icon.html) by [Double-J Design](http://www.doublejdesign.co.uk/) is licensed under [CC BY 3.0](http://creativecommons.org/licenses/by/3.0/)

RequireJS:
[License](https://github.com/jrburke/requirejs/blob/master/LICENSE)

Stapes.js:
[License](https://github.com/hay/stapes/blob/master/LICENSE.txt)

Erase_Write_Routines for STM8:
are taken from STM's Flash loader demonstrator (UM0462/STSW-MCU005)

License
-------
MIT license, see [LICENSE](./LICENSE)
