#!/bin/sh

rm -f *.bin
for file in *.s19; do
  arm-none-eabi-objcopy --input-target=srec --output-target=binary "$file" "$(basename "$file" .s19).bin"
done
