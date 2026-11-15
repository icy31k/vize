# UI workflow

- Use the shared `TextField` in `src/ui.tsx` for single-line text inputs. Set width, flex, and minimum height on the outer field so the native input stays vertically centered.
- Disable the native blue focus ring on text inputs. Use the theme accent on the outer field border to show focus.
- When adding or changing a text input or its shared styles, check the affected fields in the running macOS app. Verify that placeholders and entered text are vertically centered when focused and unfocused, and that clicking the field still lets you edit it.

# Code formatting

- Define styles in named stylesheet entries. Compute styles that depend on theme or data outside JSX, then pass them by name.
- Put each named import and each JSX prop on its own line. Put each style property and each style array entry on its own line.
- Put each clause of a compound condition and each ternary branch on its own line. Use multiline blocks for conditional statements, including guard clauses.
- Extract compound conditions and derived values into descriptive variables before using them in JSX or styles. Keep ternaries to simple two-way choices. Use `if`/`else if` or `switch` when there are multiple cases.
