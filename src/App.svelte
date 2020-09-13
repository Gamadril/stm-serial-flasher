<script>
    import settings from './api/Settings';
    import logger from './api/Logger';
    import PortDialog from './PortDialog.svelte';
    import SettingsDialog from './SettingsDialog.svelte';
    import NotSupportedDialog from './NotSupportedDialog.svelte';
    import { fade } from 'svelte/transition';
    import WebSerial from './api/WebSerial';
    import { STMApi } from './api/STMapi';
    import tools from './tools';

    const DISCONNECTED = 'disconnected';
    const CONNECTING = 'connecting';
    const CONNECTED = 'connected';

    let burgerActive = false;
    let selectedFile = null;
    let selectedPort = null;
    let logs = '';
    let showPortDialog = false;
    let showSettingsDialog = false;
    let connectionState = DISCONNECTED;
    let error = null;
    let stmApi = null;
    let deviceInfo = {
        family: '-',
        bl: '-',
        pid: '-',
        commands: [],
    };
    let stm8selected = false;
    let sending = false;

    logger.registerLogger({
        log(...args) {
            log(args[0]);
        },
    });

    function onSelectPort() {
        error = null;
        showPortDialog = true;
    }

    function onBurgerClick() {
        burgerActive = !burgerActive;
    }

    function log(message) {
        logs += message + '\n';
    }

    function onPortSelected(event) {
        error = null;
        selectedPort = event.detail;
        let serial = new WebSerial(selectedPort);
        serial.onConnect = () => {};
        serial.onDisconnect = () => {
            sending = false;
            connectionState = DISCONNECTED;
            logs = '';
        };
        stmApi = new STMApi(serial);
    }

    function onOpenFile(event) {
        error = null;
        selectedFile = event.target.files[0];
    }

    function onFlash(go) {
        error = null;
        sending = true;
        log('Reading content of the file ' + selectedFile.name);
        tools
            .readFile(selectedFile)
            .then(async (content) => {
                log('Parsing content of the file');
                const ext = tools.extension(selectedFile.name);
                let startAddress;
                let records;
                if (ext === 's19') {
                    records = tools.parseSRec(
                        true,
                        stmApi.writeBlockSize,
                        content
                    );
                } else if (ext === 'hex' || ext === 'ihx') {
                    records = tools.parseHex(
                        true,
                        stmApi.writeBlockSize,
                        content
                    );
                } else if (ext === 'bin') {
                    startAddress = parseInt(settings.startAddress);
                    records = [
                        {
                            type: 'data',
                            data: new Uint8Array(content),
                            address: startAddress,
                        },
                    ];
                }

                for (let i = 0; i < records.length; i++) {
                    let rec = records[i];

                    if (rec.type === 'data') {
                        await stmApi.write(rec.data, rec.address);
                    } else if (rec.type === 'start') {
                        log(
                            'Start address detected: 0x' +
                                rec.address.toString(16)
                        );
                        startAddress = rec.address;
                    }
                }

                if (go) {
                    startAddress =
                        startAddress || parseInt(settings.startAddress);
                    log('Starting code execution');
                    await stmApi.cmdGO(startAddress);
                    stmApi.disconnect();
                }

                sending = false;
            })
            .catch((err) => {
                sending = false;
                error = err.message;
            });
    }

    function onConnect() {
        deviceInfo = {
            family: '-',
            bl: '-',
            pid: '-',
            commands: [],
        };

        if (connectionState === DISCONNECTED) {
            connectionState = CONNECTING;
            error = null;
            stmApi
                .connect({
                    replyMode: settings.replyMode,
                    baudrate: settings.baudrate,
                })
                .then(() => {
                    connectionState = CONNECTED;
                    return stmApi.cmdGET();
                })
                .then((info) => {
                    deviceInfo.bl = info.blVersion;
                    deviceInfo.commands = info.commands;
                    deviceInfo.family = info.getFamily();
                    if (deviceInfo.family === 'STM32') {
                        return stmApi.cmdGID();
                    } else {
                        return Promise.resolve('-');
                    }
                })
                .then((pid) => {
                    deviceInfo.pid = pid;
                })
                .catch((err) => {
                    log(err);
                    error = err.message;
                    connectionState = DISCONNECTED;
                });
        } else {
            stmApi.disconnect().catch((err) => {
                error = err.message;
            });
        }
    }

    function onErase() {
        error = null;
        sending = true;
        log('Erasing flash...');
        stmApi
            .eraseAll()
            .then(() => {
                log('Flash erased');
                sending = false;
            })
            .catch((err) => {
                sending = false;
                error = err.message;
            });
    }

    function onSettings() {
        error = null;
        showSettingsDialog = true;
    }

    function onStm8Select(event) {
        let value = event.target.value;
        stm8selected = value !== '-1';
        stmApi.setDevice({
            blVersion: deviceInfo.bl,
            flash: stm8selected ? value : null,
        });
    }

    $: isConnected = connectionState === CONNECTED;
    $: isConnecting = connectionState === CONNECTING;
    $: isDisconnected = connectionState === DISCONNECTED;
    $: cmdsAllowed =
        isConnected &&
        !sending &&
        (deviceInfo.family === 'STM32' ||
            (deviceInfo.family === 'STM8' && stm8selected));
</script>

<style>
    #subtitle {
        position: absolute;
        bottom: 0;
        right: 0;
        color: crimson;
    }

    .disabled {
        pointer-events: none;
        opacity: 0.4;
    }
</style>

<!-- svelte-ignore a11y-missing-attribute -->
<!-- svelte-ignore a11y-no-onchange -->
<div id="app">
    <div class="navbar has-shadow">
        <div class="navbar-brand">
            <h1 class="navbar-item is-size-5 mr-3 pt-1">
                Web-STM-Flasher<span id="subtitle" class="is-size-6">serial</span>
            </h1>

            <a
                role="button"
                class="navbar-burger burger {burgerActive ? 'is-active' : ''}"
                aria-label="menu"
                aria-expanded="false"
                data-target="blpnavbar"
                on:click={onBurgerClick}>
                <span aria-hidden="true" />
                <span aria-hidden="true" />
                <span aria-hidden="true" />
            </a>
        </div>

        <div
            id="blpnavbar"
            class="navbar-menu {burgerActive ? 'is-active' : ''}">
            <div class="navbar-start">
                <a class="navbar-item">
                    <div class="file">
                        <label class="file-label">
                            <input
                                class="file-input"
                                type="file"
                                accept=".s19,.hex,.ihx,.bin"
                                name="file"
                                on:change={onOpenFile} />
                            <span class="icon">
                                <i class="fa fa-folder-open" />
                            </span>
                            <span class="file-label">Open File</span>
                        </label>
                    </div>
                </a>

                <a
                    class="navbar-item"
                    class:disabled={isConnecting || !selectedPort}
                    on:click={onConnect}>
                    <span class="icon"><i
                            class="fa {isConnected ? 'fa-unlink' : 'fa-link'}" /></span>
                    <span>{isConnected ? 'Disconnect' : 'Connect'}</span>
                </a>
                <a
                    class="navbar-item"
                    class:disabled={!cmdsAllowed}
                    on:click={onErase}>
                    <span class="icon"><i class="fa fa-eraser" /></span>
                    <span>Full Erase</span>
                </a>
                <a
                    class="navbar-item"
                    class:disabled={!selectedFile || !cmdsAllowed}
                    on:click={() => onFlash(false)}>
                    <span class="icon"><i class="fas fa-pen" /></span>
                    <span>Flash</span>
                </a>
                <a
                    class="navbar-item"
                    class:disabled={!selectedFile || !cmdsAllowed}
                    on:click={() => onFlash(true)}>
                    <span class="icon"><i class="fa fa-play" /></span>
                    <span>Flash & Go</span>
                </a>
                <a class="navbar-item" on:click={onSettings}>
                    <span class="icon"><i class="fa fa-cog" /></span>
                    <span>Settings</span>
                </a>
            </div>

            <div class="navbar-end">
                <a
                    class="navbar-item"
                    class:disabled={!isDisconnected}
                    on:click={onSelectPort}>
                    <span class="icon"><i class="fas fa-plug" /></span>
                    <span>{selectedPort ? selectedPort.name : 'Select port'}</span>
                </a>
            </div>
        </div>
    </div>
    {#if selectedFile}
        <div class="container is-fluid is-paddingless" in:fade>
            <div class="notification is-info py-2">
                File: {selectedFile.name}
            </div>
        </div>
    {/if}
    {#if error}
        <div class="container is-fluid is-paddingless" in:fade out:fade>
            <div class="notification is-danger">Error: {error}</div>
        </div>
    {/if}

    <div class="container is-fluid mt-4">
        <div class="columns">
            <div class="column is-narrow" style="min-width: 360px;">
                <div class="box" id="devinfo">
                    <p class="title is-5">Device Info</p>
                    <div class="level is-mobile">
                        <div class="level-left">
                            <div class="level-item">
                                <div class="label">Family:</div>
                            </div>
                        </div>
                        <div class="level-right">
                            <div class="level-item">
                                <div class="value">{deviceInfo.family}</div>
                            </div>
                        </div>
                    </div>
                    <div class="level is-mobile">
                        <div class="level-left">
                            <div class="level-item">
                                <div class="label">Bootloader:</div>
                            </div>
                        </div>
                        <div class="level-right">
                            <div class="level-item">
                                <div class="value">{deviceInfo.bl}</div>
                            </div>
                        </div>
                    </div>
                    <div class="level is-mobile">
                        <div class="level-left">
                            <div class="level-item">
                                <div class="label">Product ID:</div>
                            </div>
                        </div>
                        <div class="level-right">
                            <div class="level-item">
                                <div class="value">{deviceInfo.pid}</div>
                            </div>
                        </div>
                    </div>
                    <div
                        class="level is-mobile"
                        class:is-hidden={deviceInfo.family !== 'STM8'}>
                        <div class="level-left">
                            <div class="level-item">
                                <div class="label">STM8 type:</div>
                            </div>
                        </div>
                        <div class="level-right">
                            <div class="level-item">
                                <div class="select value">
                                    <select
                                        id="devices"
                                        on:change={onStm8Select}>
                                        <option value="-1" selected>
                                            Select device...
                                        </option>
                                        <option value="32">STM8 S/A 32K</option>
                                        <option value="128">
                                            STM8 S/A 128K
                                        </option>
                                        <option value="256">
                                            STM8 S/A 256K
                                        </option>
                                        <option value="0">STM8 L</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="column">
                <div class="box">
                    <p class="title is-5">Log Messages</p>
                    <pre>{logs}</pre>
                </div>
            </div>
        </div>
    </div>

    {#if showPortDialog}
        <PortDialog
            on:close={() => (showPortDialog = false)}
            on:selected_port={onPortSelected} />
    {/if}

    {#if showSettingsDialog}
        <SettingsDialog on:close={() => (showSettingsDialog = false)} />
    {/if}

    {#if !navigator.serial}
        <NotSupportedDialog/>
    {/if}
</div>
