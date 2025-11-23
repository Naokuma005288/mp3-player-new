export function formatTime(seconds) {
    if (isNaN(seconds) || seconds === null) return '--:--';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

export function createToast(toastEl, toastMessageEl) {
    let toastTimeout = null;
    return function showToast(message, isError = false) {
        if (toastTimeout) clearTimeout(toastTimeout);

        toastMessageEl.textContent = message;
        toastEl.style.backgroundColor = isError ? 'var(--thumb-color)' : 'var(--toast-bg)';

        toastEl.classList.add('show');
        toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 3000);
    };
}
