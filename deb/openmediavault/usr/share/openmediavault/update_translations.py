import os
import glob
from datetime import datetime
from pathlib import Path
from polib import pofile, POFile, POEntry
from googletrans import Translator
from concurrent.futures import ThreadPoolExecutor
import time

# Konfiguracja
LOCALE_DIR = Path('locale')
POT_FILE = LOCALE_DIR / 'openmediavault.pot'
PO_PATTERN = '**/openmediavault.po'
COMMENT_PREFIX = 'TRANSLATION NEEDED: '
MAX_WORKERS = 5  # Maksymalna liczba wątków do tłumaczenia
TRANSLATE_SERVICE = 'google'  # 'google' lub 'libretranslate'

# Inicjalizacja translatora
translator = Translator(service_urls=['translate.google.com'])

def translate_text(text, dest_lang, src_lang='en'):
    """Funkcja tłumacząca tekst przy użyciu Google Translate"""
    try:
        if not text.strip():
            return text
            
        # Ograniczenie szybkości zapytań (Google ma limity)
        time.sleep(0.1)
        
        translation = translator.translate(text, dest=dest_lang, src=src_lang)
        return translation.text
    except Exception as e:
        print(f"Błąd tłumaczenia: {str(e)}")
        return COMMENT_PREFIX + text

def process_po_file(po_path, pot_entries):
    """Przetwarzanie pojedynczego pliku PO"""
    po_path = Path(po_path)
    lang_code = po_path.parent.name.split('_')[0]  # np. 'pl' z 'pl_PL'
    
    print(f"\nPrzetwarzanie: {lang_code}")
    po = pofile(str(po_path))
    updated = False

    for pot_entry in pot_entries:
        if pot_entry.msgid == '':
            continue

        po_entry = po.find(pot_entry.msgid)
        if po_entry is None:
            # Automatyczne tłumaczenie
            translated_text = translate_text(pot_entry.msgid, lang_code)
            
            new_entry = POEntry(
                msgid=pot_entry.msgid,
                msgstr=translated_text,
                comment=pot_entry.comment,
                tcomment='Auto-translated from POT file'
            )
            
            if pot_entry.msgid_plural:
                new_entry.msgid_plural = pot_entry.msgid_plural
                # Tłumaczenie formy mnogiej (uproszczone)
                plural_translation = translate_text(pot_entry.msgid_plural, lang_code)
                new_entry.msgstr_plural = {
                    0: translated_text,
                    1: plural_translation
                }
            
            po.append(new_entry)
            updated = True

    # Oznacz przestarzałe tłumaczenia
    for po_entry in po:
        if po_entry.msgid and not any(e.msgid == po_entry.msgid for e in pot_entries):
            po_entry.obsolete = True
            updated = True

    if updated:
        po.metadata['PO-Revision-Date'] = datetime.now().strftime('%Y-%m-%d %H:%M%z')
        po.metadata['X-Generator'] = 'OpenMediaVault Translation Sync with Auto-Translate'
        po.save()
        print(f"Zaktualizowano plik {lang_code}/openmediavault.po")
    else:
        print(f"Brak zmian w pliku {lang_code}/openmediavault.po")

def update_translations():
    try:
        if not POT_FILE.exists():
            raise FileNotFoundError(f"Plik szablonu {POT_FILE} nie istnieje")

        pot = pofile(str(POT_FILE))
        pot_entries = [e for e in pot if e.msgid != '']
        print(f"Znaleziono {len(pot_entries)} wiadomości w pliku szablonu")

        po_files = glob.glob(str(LOCALE_DIR / PO_PATTERN), recursive=True)
        if not po_files:
            print(f"Nie znaleziono plików .po w {LOCALE_DIR}")
            return

        # Przetwarzaj pliki równolegle
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            executor.map(lambda f: process_po_file(f, pot_entries), po_files)

        print("\nSynchronizacja zakończona!")

    except Exception as e:
        print(f"Błąd podczas synchronizacji tłumaczeń: {str(e)}")
        exit(1)

if __name__ == "__main__":
    update_translations()
