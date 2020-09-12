<script>
    import { createEventDispatcher, onMount } from 'svelte';

    const dispatch = createEventDispatcher();
    const close = () => dispatch('close');

    let devices = [];
    let ports = [];

    async function getPaired() {
        ports = await navigator.serial.getPorts();

        devices = ports.map((port) => {
            let info = port.getInfo();
            let name = 'Serial Port';
            if (info.usbProductId && info.usbVendorId) {
                name += (' (usb:0x' + info.usbVendorId.toString(16) + ':0x' + info.usbProductId.toString(16) + ')');
            }
            port.name = 'Serial Port';
            return name;
        });
    }

    function onOkClick() {
        close();
    }

    function onPortSelected(index) {
        dispatch('selected_port', ports[index]);
        close();
    }

    function onDetectNew() {
        navigator.serial.requestPort().then(getPaired);
    }

    onMount(getPaired);
</script>

<style>
    .modal {
        z-index: 400;
    }
</style>

<div class="modal is-active">
    <div class="modal-background" />
    <div class="modal-card">
        <header class="modal-card-head">
            <p class="modal-card-title">Paired Ports</p>
            <button class="delete" aria-label="close" on:click={onOkClick} />
        </header>
        <section class="modal-card-body is-paddingless">
            {#each devices as dev, i}
                <div
                    class="card"
                    on:click={() => onPortSelected(i)}
                    tabindex={i}>
                    <div class="card-content">
                        <div class="level">
                            <div class="level-left">
                                <div class="level-item">
                                    <span class="icon"><i class="fa fa-plug" /></span>
                                </div>
                                <div class="level-item"><span>{dev}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
            {#if ports.length === 0}
                <div class="card">
                    <div class="card-content">
                        <div>No paired ports detected</div>
                    </div>
                </div>
            {/if}
        </section>
        <footer class="modal-card-foot">
            <button class="button is-success" on:click={onDetectNew}>Pair new
                port</button>
        </footer>
    </div>
</div>
