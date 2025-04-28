declare module 'react-native-dialog-input' {
  interface DialogInputProps {
    isDialogVisible: boolean;
    title: string;
    message: string;
    hintInput: string;
    submitInput: (inputText: string) => void;
    closeDialog: () => void;
  }

  const DialogInput: React.FC<DialogInputProps>;
  export default DialogInput;
} 