# Changelog

## 3.1.0 — 2026-07-27

### Added

- Automatic extraction of full-resolution pages from DocSend PDF documents.
- Progress reporting while DocSend PDF pages are collected.
- Portrait and landscape print orientation based on each captured page.

### Fixed

- Distinguish vertical DocSend PDFs from slide carousels during auto capture.
- Resolve lazy DocSend pages through their authenticated page-data endpoint instead of unreliable screenshot stitching.
- Continue opening the print dialog when an output image fails to load.

## 3.0.0 — 2025-09-19

- Added manual area selection and capture for any website.
- Added the popup-based capture, reorder, delete, and print workflow.
