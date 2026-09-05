# Fonts

`Inter-Regular.woff2` and `Inter-Medium.woff2` are subsets of [Inter](https://rsms.me/inter/) 4.1,
covering the Latin ranges and the only two weights the site sets (400 and 500). Subsetting takes the
pair from 226 kB to 58 kB, which matters because the lines cannot be measured until the face they
will be read in has arrived.

Inter is licensed under the SIL Open Font License 1.1 (`LICENSE.txt`).

To regenerate from a new Inter release:

```sh
pip install fonttools brotli

RANGE="U+0000-00FF,U+0100-024F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,\
U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"

for weight in Regular Medium; do
  curl -sO "https://rsms.me/inter/font-files/Inter-$weight.woff2"
  pyftsubset "Inter-$weight.woff2" \
    --output-file="Inter-$weight.woff2" \
    --flavor=woff2 \
    --layout-features='kern,liga,calt,ccmp,locl,mark,mkmk' \
    --unicodes="$RANGE" \
    --no-hinting \
    --desubroutinize
done
```

Adding a weight, an italic, or copy outside these ranges means adding a face here and a matching
`@font-face` in `styles.css`.
