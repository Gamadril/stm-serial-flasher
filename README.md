<img src='https://raw.githubusercontent.com/Gamadril/stm-serial-flasher/master/public/res/logo_128.png' width='40px' height='40px' /> Web STM Flasher (serial)
==================

STM serial flasher is a [Web App](https://gamadril.github.io/stm-serial-flasher/)  for programming the STM controllers using the embedded ROM bootloader over a serial port. It uses Chrome's Web Serial API (experimental) and works only with browsers based on Chromium like Chrome, Edge and Opera.
The app supports STM8 and STM32 microcontrollers. Tests were done on the STM8-Discovery and STM32f4-discovery boards.

The old version, which was implemented as Chrome extension can be found in the branch of this repository.


Requirements
------------
Latest Chromium based Browsers (Chrome, Opera, Edge). Current code base was tested on Chrome v86 beta.
Since the Web Serial API is highly experimental you need to activate the "Experimental Web Platform features" (chrome://flags/#enable-experimental-web-platform-features) first.

Open the [Web App](https://gamadril.github.io/stm-serial-flasher/)



Device connection
-----------------
Connect the device to your PC using a TTL level shifter.

| Device            | Host            |
| ----------------- | --------------- |
| GND               | GND             |
| TX                | RX              |
| RX                | TX              |
| NRST              | DTR             |
| BOOT0<sup>*</sup> | RTS<sup>*</sup> |

*: for STM32 only.

Make sure you choose the right USART interface of the targe since the bootloader is not listening on all USART interfaces. For STM32 microcontrollers check AN2606 for more info. 


## Connection of tested boards
### stm32f4-discovery
| Device | Host |
| ------ | ---- |
| GND    | GND  |
| PB10   | RX   |
| PB11   | TX   |
| NRST   | DTR  |
| BOOT0  | RTS  |

### stm8s-discovery
| Device | Host |
| ------ | ---- |
| CN1-5  | GND  |
| CN4-10 | RX   |
| CN4-11 | TX   |
| CN1-1  | DTR  |

### NUCLEO-F303RE
| Device | Host |
| ------ | ---- |
| GND    | GND  |
| PA10   | TX   |
| PA9    | RX   |
| NRST   | DTR  |
| BOOT0  | RTS  |

3rd party components
--------------------
Icons:
[SMD 64 pin Icon](http://www.iconarchive.com/show/electronics-icons-by-double-j-design/SMD-64-pin-icon.html) by [Double-J Design](http://www.doublejdesign.co.uk/) is licensed under [CC BY 3.0](http://creativecommons.org/licenses/by/3.0/)

Bulma:
[License](https://github.com/jgthms/bulma/blob/master/LICENSE)

Svelte:
[License](https://github.com/sveltejs/svelte/blob/master/LICENSE)

Font Awesome:
[License](https://github.com/FortAwesome/Font-Awesome/blob/master/LICENSE.txt)

Erase_Write_Routines for STM8:
are taken from STM's Flash loader demonstrator (UM0462/STSW-MCU005)

License
-------
MIT license, see [LICENSE](./LICENSE)
