# Cocos Creator TMP Extension (3.8.x)

An extended TextMeshPro-inspired text solution for **Cocos Creator**, featuring advanced text layout controls, text effects, and a built-in Signed Distance Field (SDF) Font Generator.

## Overview

This extension enhances text rendering and layout capabilities in Cocos Creator by providing additional controls for text alignment, character spacing, automatic word shrinking, and visual effects.

It also includes a built-in **SDF Font Generator**, accessible directly from the editor, to help generate SDF font assets for text rendering.

The extension is designed to make text more flexible and easier to customize, especially for UI elements that need precise spacing, controlled text fitting, and additional visual styling.

## Features

### Text Layout and Formatting

#### 1. Justification

Provides justification controls for text layout.

Justification helps control how text is aligned within its available layout area, making it easier to achieve consistent text presentation across UI elements.

**Use cases:**
- Aligning text within UI containers.
- Improving the visual consistency of multiline text.
- Adjusting text presentation to suit different interface layouts.

#### 2. Per-Word Shrinking

Automatically reduces the font size of individual words when necessary to help them fit within the available text area.

Instead of shrinking the entire text uniformly, this feature allows words to be adjusted individually, helping preserve the readability and size of surrounding text.

**Use cases:**
- Preventing long words from overflowing their containers.
- Fitting text into buttons, labels, and other space-constrained UI elements.
- Handling words of varying lengths in dynamic text content.

#### 3. Per-Letter / Character Spacing

Allows spacing between individual letters or characters to be adjusted.

Character spacing provides additional control over the appearance of text, making it possible to create tighter or more widely spaced typography.

**Use cases:**
- Fine-tuning the appearance of headings and labels.
- Improving the visual balance of short text elements.
- Matching specific UI typography requirements.

#### 4. Minimum Font Size

Defines the minimum font size used by the Per-Word Shrinking feature.

This setting establishes a lower size limit to prevent words from shrinking beyond the configured minimum.

**How it works:**
- Per-Word Shrinking adjusts words when needed.
- The Minimum Font Size setting establishes the lower boundary for that adjustment.
- This helps balance fitting text into the available space with maintaining readability.

**Note:** Minimum Font Size is used by Per-Word Shrinking and is not intended as a standalone text effect.

### Text Visual Effects

The following visual effects are currently marked as **Work in Progress (WIP)**, but their functionality is working.

#### 5. Gradient (WIP)

Provides gradient styling for text.

Gradients allow text to use color transitions rather than a single uniform color, adding more visual variety to UI typography.

**Potential use cases:**
- Decorative headings.
- Highlighted text and labels.
- Special UI elements that require additional visual emphasis.

#### 6. Shadow (WIP)

Adds a shadow effect to text.

Text shadows can help distinguish text from its background and provide additional depth to the interface.

**Potential use cases:**
- Improving text contrast against busy backgrounds.
- Adding depth to headings and labels.
- Styling buttons, notifications, and other UI elements.

#### 7. Outline (WIP)

Adds an outline around text.

Outlines help separate characters from the background and can give text a stronger, more defined appearance.

**Potential use cases:**
- Improving readability against contrasting backgrounds.
- Styling titles and important labels.
- Creating emphasized text for game UI elements.

#### 8. Glow (WIP)

Adds a glow effect to text.

Glow can create a luminous appearance that works well with visually expressive interfaces.

**Potential use cases:**
- Highlighting important text.
- Creating glowing headings or labels.
- Supporting game interfaces with neon or luminous visual styles.

> **WIP status:** Gradient, Shadow, Outline, and Glow are functioning, but remain under development. Their implementation and available controls may change in future updates.

## SDF Font Generator

The extension includes a built-in **Signed Distance Field (SDF) Font Generator** for generating SDF font assets directly from the Cocos Creator editor.

### Accessing the Generator

Open the Cocos Creator editor and navigate to:

**`Panel > TMPText > SDF Font Generator`**

Select the SDF Font Generator entry to access the tool.

### What Is an SDF Font?

A Signed Distance Field (SDF) represents the distance between a point and the boundary of a shape. For fonts, this information can be used to render glyphs at different sizes while maintaining smooth edges.

SDF-based text rendering is particularly useful when text needs to be scaled or displayed at different sizes.

### Why Use SDF Fonts?

- **Scalable text:** Helps maintain smooth-looking glyph edges across different display sizes.
- **UI flexibility:** Supports text that may be resized or scaled throughout the interface.
- **Visual effects:** Distance-field data can be useful for implementing effects such as outlines and glows, depending on the rendering implementation.

The generator is integrated into the extension to make SDF font generation accessible without requiring a separate external tool.

## Limitations and Known Issues

The following features are currently unavailable and remain on the to-do list.

| Feature | Status |
|---|---|
| Justification | Available |
| Per-Word Shrinking | Available |
| Per-Letter / Character Spacing | Available |
| Minimum Font Size | Available; used by Per-Word Shrinking |
| Gradient | WIP; functioning |
| Shadow | WIP; functioning |
| Outline | WIP; functioning |
| Glow | WIP; functioning |
| Bold | To Do |
| Italic | To Do |
| Underlined Text | To Do |

### Unsupported Text Formatting

**Bold, Italic, and Underlined text formatting are not currently available.**

These features are planned for future development and should not be considered supported in the current version.

## Installation and Setup

Installation instructions depend on how the extension is packaged and distributed.

After adding the extension to a compatible Cocos Creator project:

1. Open the project in Cocos Creator.
2. Allow the editor to finish importing or compiling the extension.
3. Locate the text extension's available controls and properties.
4. To generate an SDF font, navigate to `Panel > TMPText > SDF Font Generator`.

If the extension requires additional assets, configuration, or dependencies, follow the corresponding project-specific setup instructions.

## Compatibility

- **Engine:** Cocos Creator
- **Primary language:** TypeScript (where applicable)
- **Font workflow:** Signed Distance Field (SDF) font generation

The exact supported Cocos Creator versions, platform compatibility, and external dependencies have not yet been specified. Confirm these details before distributing the extension for use in other projects.

## Roadmap

Planned improvements include:

- [ ] Implement Bold text formatting.
- [ ] Implement Italic text formatting.
- [ ] Implement Underlined text formatting.
- [ ] Continue refining Gradient, Shadow, Outline, and Glow.
- [ ] Improve documentation and usage examples.
- [ ] Document supported engine versions and installation requirements.

## Contributing

Contributions, bug reports, and feature suggestions are welcome, subject to the project's chosen license and contribution guidelines.

When reporting an issue, please include:

- Cocos Creator version.
- Steps to reproduce the issue.
- Expected behavior.
- Actual behavior.
- Relevant error messages or screenshots, when available.

For feature requests, describe the intended behavior and the problem the feature would solve.

---

**Cocos Creator TMP Extension — Flexible text layout, visual effects, and built-in SDF font generation.**
