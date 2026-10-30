# Seanime Manga English Titles

A [Seanime](https://seanime.app) plugin that shows an English title for your manga instead of the romanized one. It works on manga entry pages and on manga cards, for AniList manga and custom-source manga.

It is **display only**. It changes the text on screen and never writes anything to Seanime's data or to AniList.

> Companion plugin: [seanime-manga-categories](https://github.com/addregin/seanime-manga-categories) (local custom categories for your manga).

## Features

- Replaces the big title on the manga entry page and the title on manga cards.
- Picks the English title automatically from AniList's English title and the manga's synonyms.
- Tray icon (**En**) with an on/off switch. Turning it off puts the original titles back.
- Per-manga title chooser in the tray: open a manga, then pick any English-looking name, "Auto", or "Original title". Your choice is remembered.

## Install

1. In Seanime, open the **Extensions** page and add an extension from a URL.
2. Paste this manifest URL:

   ```
   https://raw.githubusercontent.com/addregin/seanime-manga-english-titles/main/manga-english-titles.json
   ```

3. Accept the permission request (it only uses plugin storage to remember your settings) and enable the plugin.

## How it picks a title

1. A synonym that clearly reads as English (contains common English words).
2. AniList's own English title.
3. A looser guess among the synonyms, used only if the current title doesn't already look English.

If the automatic pick is wrong for a manga, choose a different name in the tray.

## Notes

- Names with non-Latin or accented characters are not offered.
- Cards for manga you haven't opened only update after you open that entry once or the collection reloads.
- Debug messages are printed to the console with the prefix `[manga-english-titles]`.

## License

MIT
