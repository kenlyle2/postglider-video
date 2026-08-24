#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
OUT="$(dirname "$0")/../demo-corpus/mastermind-coaching"
mkdir -p "$OUT/raw-vtt" "$OUT/captions"

# Real 20-video sample, chosen for actual content shape (Mastermind coaching series +
# Fitness Over Fifty + one real client testimonial), not recipes -- her channel is
# coaching/testimonial-heavy, confirmed live before picking this list.
declare -a VIDEOS=(
"01|WEBINAR You CAN Reverse Your Chronic Diseases|DxklizjZzEU"
"02|MASTERMIND What about Physical Defects and Why 21 Days|atdHGVCcRKA"
"03|Mastermind RENOVATE Your Body|cIbEmpiaEq0"
"04|MASTERMIND Intro and QA to SHB v1|7b_HJyLrOYQ"
"05|MASTERMIND Intro and QA to SHB v2|mKMDp7XUONI"
"06|MASTERMIND Implementing VISION 2024|VXCYalglN4A"
"07|MASTERMIND 9 We have to SHARE Why|t92XzuR62uc"
"08|MASTERMIND 8 The NEED for SWEET|dbuRUUU25kI"
"09|MASTERMIND 7 Whats in Raw Salad|LMvY8WHgx3c"
"10|MASTERMIND Clean and DeClutter|am_AdktL3fg"
"11|MASTERMIND My Chronic Disease|QyahaOlMyc0"
"12|MASTERMIND 4 Sick from Stress|l7IXCUMP6no"
"13|Mastermind 1 The Basics of Health|hYsuRA-m5ZM"
"14|Mastermind 3 The Vanishing Money and Health|GNnLyhLS7ZQ"
"15|Mastermind 2 Self-Heal for Cheap|yztEd7tT9NI"
"16|Fitness over Fifty Introduction 23|wVEkKkIa0aY"
"17|FITNESS over FIFTY BASICS RAL show 2023|wyt5JaFbwJE"
"18|FITNESS over FIFTY Sleep Rhythm and Routine|ISvJAbHAfA4"
"19|All 100s FITNESS over FIFTY Workout Who OWNS my BODY|XlsBzP6sQJM"
"20|JS CBM aAli de Sousa testimonial ad1|fgmbttYAwKE"
)

for entry in "${VIDEOS[@]}"; do
  IFS='|' read -r n title vid <<< "$entry"
  echo "[$n] $title ($vid)"
  uvx yt-dlp --write-auto-sub --write-sub --sub-lang en --skip-download --sub-format vtt \
    -o "$OUT/raw-vtt/${n}-${vid}.%(ext)s" "https://www.youtube.com/watch?v=${vid}" \
    > "/tmp/ytdlp-johanna-${vid}.log" 2>&1 || echo "  WARN: yt-dlp failed for $vid, see log"
done
echo "Done downloading captions."
