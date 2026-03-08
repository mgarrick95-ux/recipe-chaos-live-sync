# fix-mojibake.ps1 (FULL ASCII)
# - No literal emoji
# - No literal mojibake (like ðŸ“–)
# Everything non-ascii is generated from codepoints.

$backupDir = ".ps-utf8-fix-backups\$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

function Ch([int]$cp) { [char]$cp }
function Emoji([int]$cp) { [char]::ConvertFromUtf32($cp) }

# ---- Common mojibake pieces (codepoints) ----
$CP_F0   = 0x00F0   # ð
$CP_0178 = 0x0178   # Ÿ
$CP_201C = 0x201C   # “
$CP_201D = 0x201D   # ”
$CP_2013 = 0x2013   # –
$CP_00A6 = 0x00A6   # ¦
$CP_2020 = 0x2020   # †
$CP_2019 = 0x2019   # ’
$CP_20AC = 0x20AC   # €
$CP_00A2 = 0x00A2   # ¢
$CP_2014 = 0x2014   # —
$CP_2026 = 0x2026   # …

# ---- Build the exact bad sequences we saw (ASCII-safe) ----
# "ðŸ" prefix (sometimes appears alone)
$MJ_0 = (Ch $CP_F0) + (Ch $CP_0178)

# Full mojibake emoji sequences (4 chars): ð Ÿ “ <dash-ish>
$MJ_CAN    = $MJ_0 + (Ch $CP_00A5) + (Ch 0x00AB)   # ðŸ¥«
$MJ_ICE    = $MJ_0 + (Ch 0x00A7) + (Ch 0x008A)     # ðŸ§Š
$MJ_BREAD  = $MJ_0 + (Ch 0x017E)                   # ðŸž
$MJ_CHEESE = $MJ_0 + (Ch 0x00A7) + (Ch 0x20AC)     # ðŸ§€
$MJ_MILK   = $MJ_0 + (Ch 0x00A5) + (Ch 0x009B)     # ðŸ¥›
$MJ_JAR    = $MJ_0 + (Ch 0x00AB) + (Ch 0x2122)     # ðŸ«™
$MJ_TAG    = $MJ_0 + (Ch 0x00B7) + (Ch 0x00EF) + (Ch 0x00B8) # ðŸ·ï¸
$MJ_CARROT = $MJ_0 + (Ch 0x00A5) + (Ch 0x2022)     # ðŸ¥•
$MJ_GARLIC = $MJ_0 + (Ch 0x00A7) + (Ch 0x201E)     # ðŸ§„
$MJ_BOOK   = $MJ_0 + (Ch 0x201C) + (Ch 0x2013)     # ðŸ“–
$MJ_BOOKS  = $MJ_0 + (Ch 0x201C) + (Ch 0x201A)     # ðŸ“š
$MJ_KNIFE  = $MJ_0 + (Ch 0x201D) + (Ch 0x00AA)     # ðŸ”ª
$MJ_BOWL   = $MJ_0 + (Ch 0x00A5) + (Ch 0x00A3)     # ðŸ¥£
$MJ_BOX    = $MJ_0 + (Ch 0x201C) + (Ch 0x00A6)     # ðŸ“¦
$MJ_BOMB   = $MJ_0 + (Ch 0x2019) + (Ch 0x00A3)     # ðŸ’£
$MJ_HMM    = $MJ_0 + (Ch 0x00A4) + (Ch 0x00A8)     # ðŸ¤¨

# Euro-style mojibake sequences
$EU = Ch $CP_20AC
$CENT = Ch $CP_00A2
$LDQ = Ch $CP_201C
$RDQ = Ch $CP_201D
$EMD = Ch $CP_2014
$ELL = Ch $CP_2026

$EU_LDQ  = "$EU$LDQ"     # €“
$EU_RDQ  = "$EU$RDQ"     # €”
$EU_EMD  = "$EU$EMD"     # €—
$EU_ELL  = "$EU$ELL"     # €…
$EU_CENT = "$EU$CENT"    # €¢

# Dagger arrow: †’
$DAG = Ch $CP_2020
$RSQ = Ch $CP_2019
$DAG_ARROW = "$DAG$RSQ"

# ---- Replacement emoji (generated; script contains no emoji literals) ----
$E_CAN    = Emoji 0x1F96B
$E_ICE    = Emoji 0x1F9CA
$E_BREAD  = Emoji 0x1F35E
$E_CHEESE = Emoji 0x1F9C0
$E_MILK   = Emoji 0x1F95B
$E_JAR    = Emoji 0x1FAD9
$E_TAG    = (Emoji 0x1F3F7) + (Emoji 0xFE0F)
$E_CARROT = Emoji 0x1F955
$E_GARLIC = Emoji 0x1F9C4
$E_BOOK   = Emoji 0x1F4D6
$E_BOOKS  = Emoji 0x1F4DA
$E_KNIFE  = Emoji 0x1F52A
$E_BOWL   = Emoji 0x1F963
$E_BOX    = Emoji 0x1F4E6
$E_BOMB   = Emoji 0x1F4A3
$E_HMM    = Emoji 0x1F928
$E_APPLE  = Emoji 0x1F34E

# ---- Files ----
$targets = Get-ChildItem .\app, .\components, .\lib -Recurse -File |
  Where-Object { $_.Extension -in ".ts", ".tsx" }

$changed = @()

foreach ($file in $targets) {
  $original = Get-Content -LiteralPath $file.FullName -Raw
  $content = $original

  # Simple mojibake punctuation
  $content = $content -replace "â€¦", "..."
  $content = $content -replace "€¦",  "..."
  $content = $content -replace "â€™", "'"

  # Euro sequences (built safely)
  $content = $content -replace [regex]::Escape($EU_LDQ), '"'
  $content = $content -replace [regex]::Escape($EU_RDQ), '"'
  $content = $content -replace [regex]::Escape($EU_EMD), "--"
  $content = $content -replace [regex]::Escape($EU_ELL), "..."
  $content = $content -replace [regex]::Escape($EU_CENT), " - "

  # Catch raw tokens that appear in repo
  $content = $content -replace "€œ", '"'
  $content = $content -replace "€",  '"'

  # Dagger + arrow
  $content = $content -replace [regex]::Escape($DAG_ARROW), "->"
  $content = $content -replace [regex]::Escape($DAG), "<-"

  # Other offenders
  $content = $content -replace "‰ˆ", "~"
  $content = $content -replace "œ…", "..."
  $content = $content -replace "œ¨", "*"
  $content = $content -replace "œ¦", "*"

  # Mojibake emoji -> real emoji (no literal mojibake in script)
  $content = $content -replace [regex]::Escape($MJ_CAN),    $E_CAN
  $content = $content -replace [regex]::Escape($MJ_ICE),    $E_ICE
  $content = $content -replace [regex]::Escape($MJ_BREAD),  $E_BREAD
  $content = $content -replace [regex]::Escape($MJ_CHEESE), $E_CHEESE
  $content = $content -replace [regex]::Escape($MJ_MILK),   $E_MILK
  $content = $content -replace [regex]::Escape($MJ_JAR),    $E_JAR
  $content = $content -replace [regex]::Escape($MJ_TAG),    $E_TAG
  $content = $content -replace [regex]::Escape($MJ_CARROT), $E_CARROT
  $content = $content -replace [regex]::Escape($MJ_GARLIC), $E_GARLIC
  $content = $content -replace [regex]::Escape($MJ_BOOK),   $E_BOOK
  $content = $content -replace [regex]::Escape($MJ_BOOKS),  $E_BOOKS
  $content = $content -replace [regex]::Escape($MJ_KNIFE),  $E_KNIFE
  $content = $content -replace [regex]::Escape($MJ_BOWL),   $E_BOWL
  $content = $content -replace [regex]::Escape($MJ_BOX),    $E_BOX
  $content = $content -replace [regex]::Escape($MJ_BOMB),   $E_BOMB
  $content = $content -replace [regex]::Escape($MJ_HMM),    $E_HMM

  # Fix partial "ðŸ" apple case in frostpantry
  $content = $content -replace 'emoji:\s*"' + [regex]::Escape($MJ_0) + '"\s*', ('emoji: "' + $E_APPLE + '"')

  if ($content -ne $original) {
    $safeName = ($file.FullName -replace '[:\\]', '_')
    Copy-Item -LiteralPath $file.FullName (Join-Path $backupDir $safeName) -Force
    Set-Content -LiteralPath $file.FullName -Value $content -Encoding utf8
    $changed += $file.FullName
  }
}

Write-Host "Changed files: $($changed.Count)"
$changed | ForEach-Object { Write-Host " - $_" }
