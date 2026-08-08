import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { ContentCopy } from '@mui/icons-material';

export default function CopyDialog({
  open,
  text,
  onClose,
}: {
  open: boolean;
  text: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setCopied(false);
    }
  }, [open]);

  return (
    <Dialog fullWidth open={open} onClose={onClose}>
      <DialogTitle>Copy Listed Participants</DialogTitle>
      <DialogContent>
        <Stack
          direction="row"
          spacing="8px"
          alignItems="center"
          paddingTop="8px"
        >
          <TextField
            fullWidth
            size="small"
            variant="outlined"
            value={text}
            slotProps={{ input: { readOnly: true } }}
            onFocus={(event) => {
              event.target.select();
            }}
          />
          <Button
            variant="contained"
            color={copied ? 'success' : 'primary'}
            startIcon={<ContentCopy />}
            sx={{ flexShrink: 0, minWidth: '120px' }}
            onClick={async () => {
              await window.electron.copyToClipboard();
              setCopied(true);
            }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
