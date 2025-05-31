export const sendRightArrow = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', {'keyCode': 39}));
}