#!/bin/bash
# ¿Lo que está en vivo es lo mismo que hay en GitHub?
cd "$(dirname "$0")" || exit 1
git fetch -q origin
L=$(git rev-parse --short HEAD); R=$(git rev-parse --short origin/main)
echo "  GitHub $R   ·   copia local $L"
[ "$L" != "$R" ] && git log --oneline "$L..$R" 2>/dev/null | sed 's/^/  sin traer: /'
echo
DESFASE=0
for f in public/index.html public/styles.css public/app.js prompts/system.md prompts/clasificador.md api/chat.mjs; do
  case "$f" in public/*) URL="https://amber-prototipo.vercel.app/${f#public/}";; *) URL="";; esac
  if [ -n "$URL" ]; then
    A=$(git show "origin/main:$f" | shasum | cut -c1-8)
    B=$(curl -s "$URL?$(date +%s%N)" | shasum | cut -c1-8)
    if [ "$A" = "$B" ]; then echo "  = $f"; else echo "  ≠ $f   (GitHub $A, en vivo $B)"; DESFASE=1; fi
  fi
done
echo
if [ "$DESFASE" = "1" ]; then echo "  Hay algo en GitHub que no está desplegado."; else echo "  En vivo = GitHub."; fi
