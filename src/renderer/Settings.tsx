import {
  Settings as SettingsIcon,
  Login as LoginIcon,
  Refresh,
  Edit,
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
import StartggTournamentForm from './StartggTournamentForm';

//TODO: show logged in status (and whether cookies are up to date!)
//TODO: allow log out
//TODO: when this opens, get admin list
//TODO: after selecting a tournament, close startgg form too
//TODO: make the tournament selector a bit prettier (bounding box?)

export default function Settings({
  slugDialogOpen,
  gettingTournament,
  startggTournament,
  adminedTournaments,
  gettingAdminedTournaments,
  setSlugDialogOpen,
  setAdminedTournaments,
  setGettingAdminedTournaments,
  showErrorDialog,
  getStartggTournament,
}: {
  slugDialogOpen: boolean;
  gettingTournament: boolean;
  startggTournament: Tournament;
  adminedTournaments: AdminedTournament[];
  gettingAdminedTournaments: boolean;
  setSlugDialogOpen: (val: boolean) => void;
  setGettingTournament: (val: boolean) => void;
  setAdminedTournaments: (tournaments: AdminedTournament[]) => void;
  setGettingAdminedTournaments: (gettingAdminedTournaments: boolean) => void;
  showErrorDialog: (errors: string[]) => void;
  getStartggTournament: (maybeSlug: string) => Promise<Tournament | undefined>;
}) {
  const [open, setOpen] = useState(false);

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
        onLoad={async () => {
          try {
            setGettingAdminedTournaments(true);
            setAdminedTournaments(await window.electron.getTournaments());
          } catch (e: any) {
            showErrorDialog([e instanceof Error ? e.message : e]);
          } finally {
            setGettingAdminedTournaments(false);
          }
        }}
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
        <DialogContent sx={{ pt: 0 }}>
          <Stack>
            <Button
              endIcon={<LoginIcon />}
              onClick={async () => {
                await window.electron.openStartggLoginWindow();
              }}
              variant="contained"
            >
              Login to Startgg!
            </Button>
          </Stack>

          <Stack direction="row">
            <InputBase
              disabled
              size="small"
              value={startggTournament.slug || 'Set start.gg tournament...'}
              style={{ flexGrow: 1 }}
            />
            <Tooltip arrow title="Refresh tournament and all descendants">
              <div>
                <IconButton
                  disabled={gettingTournament}
                  onClick={() => getStartggTournament(startggTournament.slug)}
                >
                  {gettingTournament ? (
                    <CircularProgress size="24px" />
                  ) : (
                    <Refresh />
                  )}
                </IconButton>
              </div>
            </Tooltip>
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
              onLoad={async () => {
                try {
                  setGettingAdminedTournaments(true);
                  setAdminedTournaments(await window.electron.getTournaments());
                } catch (e: any) {
                  showErrorDialog([e instanceof Error ? e.message : e]);
                } finally {
                  setGettingAdminedTournaments(false);
                }
              }}
            >
              <StartggTournamentForm
                gettingAdminedTournaments={gettingAdminedTournaments}
                adminedTournaments={adminedTournaments}
                gettingTournament={gettingTournament}
                getAdminedTournaments={async () => {
                  setGettingAdminedTournaments(true);
                  try {
                    setAdminedTournaments(
                      await window.electron.getTournaments(),
                    );
                  } catch (e: unknown) {
                    showErrorDialog([
                      `Unable to fetch admined tournaments: ${
                        e instanceof Error ? e.message : e
                      }`,
                    ]);
                  }
                  setGettingAdminedTournaments(false);
                }}
                getTournament={getStartggTournament}
                close={() => {
                  setSlugDialogOpen(false);
                }}
              />
            </Dialog>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
