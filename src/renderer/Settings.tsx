import {
  Settings as SettingsIcon,
  Login as LoginIcon,
  Refresh,
  Edit,
  Logout,
} from '@mui/icons-material';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Fab,
  IconButton,
  InputBase,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { AdminedTournament, Tournament } from '../common/types';
import StartggTournamentSelectorForm from './StartggTournamentSelectorForm';

export default function Settings({
  loggedInStatus,
  slugDialogOpen,
  gettingTournament,
  startggTournament,
  adminedTournaments,
  gettingAdminedTournaments,
  setSlugDialogOpen,
  setGettingAdminedTournaments,
  showErrorDialog,
  getStartggTournament,
}: {
  loggedInStatus: boolean;
  slugDialogOpen: boolean;
  gettingTournament: boolean;
  startggTournament: Tournament;
  adminedTournaments: AdminedTournament[];
  gettingAdminedTournaments: boolean;
  setSlugDialogOpen: (val: boolean) => void;
  setGettingTournament: (val: boolean) => void;
  setGettingAdminedTournaments: (gettingAdminedTournaments: boolean) => void;
  showErrorDialog: (errors: string[]) => void;
  getStartggTournament: (maybeSlug: string) => Promise<Tournament | undefined>;
}) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <Tooltip arrow title="Settings">
        <Fab
          onClick={() => setOpen(true)}
          size="small"
          style={{ position: 'absolute', bottom: 8, left: 8 }}
          sx={{
            zIndex: (theme) => theme.zIndex.modal + 1,
          }}
        >
          <SettingsIcon />
        </Fab>
      </Tooltip>
      <Dialog
        fullWidth
        open={open}
        onClose={async () => {
          setOpen(false);
        }}
      >
        <Stack
          alignItems="center"
          direction="row"
          justifyContent="space-between"
          marginRight="24px"
        >
          <DialogTitle>Settings</DialogTitle>
          <Typography variant="caption">Registration Manager</Typography>
        </Stack>
        {!loggedInStatus ? (
          <Button
            endIcon={<LoginIcon />}
            onClick={async () => {
              await window.electron.openStartggLoginWindow();
            }}
            variant="contained"
          >
            Login to Startgg!
          </Button>
        ) : (
          <DialogContent sx={{ pt: 0 }}>
            <Stack>
              <Button
                endIcon={<Logout />}
                onClick={async () => {
                  await window.electron.logOut();
                }}
                variant="contained"
              >
                Log Out
              </Button>
            </Stack>

            <Stack direction="row">
              <InputBase
                disabled
                size="small"
                value={startggTournament.slug || 'Set start.gg tournament...'}
                style={{ flexGrow: 1 }}
              />
              <Tooltip arrow title="Set start.gg tournament">
                <IconButton
                  aria-label="Set start.gg tournament"
                  onClick={() => setSlugDialogOpen(true)}
                >
                  <Edit />
                </IconButton>
              </Tooltip>
              <Dialog
                open={slugDialogOpen}
                onClose={() => {
                  setSlugDialogOpen(false);
                }}
              >
                <StartggTournamentSelectorForm
                  gettingAdminedTournaments={gettingAdminedTournaments}
                  adminedTournaments={adminedTournaments}
                  gettingTournament={gettingTournament}
                  getTournament={getStartggTournament}
                  close={() => {
                    setSlugDialogOpen(false);
                    setOpen(false);
                  }}
                  setGettingAdminedTournaments={setGettingAdminedTournaments}
                  showErrorDialog={showErrorDialog}
                />
              </Dialog>
            </Stack>
          </DialogContent>
        )}{' '}
      </Dialog>
    </>
  );
}
