// File Utilities

export function validateFilename(name) {
    return /^[a-zA-Z0-9_-]+$/.test(name);
}

export function getFilenameWithExtension(name, ext) {
    return `${name}.${ext}`;
}