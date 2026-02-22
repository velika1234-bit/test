# Простичко решение (ако си блокирала в GitHub конфликтите)

Кратък отговор на въпроса ти:

- **Не натискай „Accept current change“ и на 4-те блока на сляпо.**
- Натискай го само ако в блока остават нужните `id` елементи.

## Най-бърз безопасен вариант

1. За всеки конфликт в `index.html` избери **Accept both changes**.
2. Изтрий дублираните редове, така че всеки `id` да е само по веднъж.
3. Увери се, че тези `id` съществуват:
   - `lesson-template`, `builder-lesson-title`, `builder-slides`, `btn-build-lesson`
   - `btn-host-start`, `btn-host-next`, `btn-host-end`
   - `student-final`, `final-score`, `final-max`, `final-correct`, `final-total`
   - `btn-final-resend`, `btn-final-exit`
   - `present-shell`, `present-bg`, `present-overlay`, `present-surface`
4. Премахни маркерите `<<<<<<<`, `=======`, `>>>>>>>`.
5. Commit в GitHub Conflict Editor.

## Локална проверка (ако имаш проекта локално)

```bash
node --check app.js
rg -n "lesson-template|builder-lesson-title|btn-build-lesson|btn-host-end|student-final|present-shell" index.html app.js
```

Ако двете команди минат, имаш работеща начална версия.
