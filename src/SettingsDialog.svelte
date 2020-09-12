<script>
    import settings from './api/Settings';
    import { createEventDispatcher, onDestroy, onMount } from 'svelte';

    const dispatch = createEventDispatcher();
    const close = () => dispatch('close');

    function onOkClick() {
        close();
    }
</script>

<div class="modal is-active">
    <div class="modal-background" />
    <div class="modal-card">
        <header class="modal-card-head">
            <p class="modal-card-title">Settings</p>
            <button class="delete" aria-label="close" on:click={onOkClick} />
        </header>
        <section class="modal-card-body">
            <div class="field">
                <label class="label" for="baudList">Baud rate:</label>
                <div class="control">
                    <div class="select">
                        <select id="baudList" bind:value={settings.baudrate}>
                            <option value="4800">4800</option>
                            <option value="9600">9600</option>
                            <option value="19200">19200</option>
                            <option value="38400">38400</option>
                            <option value="57600">57600</option>
                            <option value="115200">115200</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="field">
                <label class="label" for="startingAddress">Address in flash for
                    code:</label>

                <div class="control">
                    <input
                        id="startingAddress"
                        class="input"
                        type="text"
                        placeholder="Start address in flash"
                        bind:value={settings.startAddress} />
                </div>
                <p class="help">
                    If the selected file does not provide the starting address,
                    this address will be used to write the code at. In most
                    cases this is the starting address of the flash memory
                    (STM32: 0x8000000 and STM8: 0x8000).
                </p>
            </div>

            <div class="field">
                <div class="control">
                    <label class="checkbox">
                        <input
                            type="checkbox"
                            bind:checked={settings.replyMode} /> Use Reply mode (STM8)
                    </label>
                </div>
                <div class="help">
                    <div>
                        Some STM8 device interfaces require "reply" mode for
                        serial communication. See UM0560 for details. Uncheck
                        for STM32.
                    </div>
                </div>
            </div>
        </section>
    </div>
</div>
