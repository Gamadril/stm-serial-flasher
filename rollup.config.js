import svelte from 'rollup-plugin-svelte'
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
    input: 'src/main.js',
    output: {
        file: 'public/main.min.js',
        name: 'app',
        format: 'iife'
    },
    plugins: [
        svelte({
            css: css => {
                css.write('css/bundle.css', false);
            }
        }),
        resolve({
            browser: true,
            dedupe: ['svelte']
        }),
        commonjs()
    ]
};
