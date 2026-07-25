import {
  Button,
  CircularProgress,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { FormEvent } from 'react';
import { Refresh } from '@mui/icons-material';
import { AdminedTournament, Tournament } from '../common/types';

export default function StartggTournamentSelectorForm({
  gettingAdminedTournaments,
  adminedTournaments,
  gettingTournament,
  setGettingAdminedTournaments,
  getTournament,
  showErrorDialog,
  close,
}: {
  gettingAdminedTournaments: boolean;
  adminedTournaments: AdminedTournament[];
  gettingTournament: boolean;
  setGettingAdminedTournaments: (gettingAdminedTournaments: boolean) => void;

  getTournament: (
    maybeSlug: string,
    initial?: boolean,
  ) => Promise<Tournament | undefined>;
  showErrorDialog: (errors: string[]) => void;

  close: () => void;
}) {
  const getTournamentOnSubmit = async (event: FormEvent<HTMLFormElement>) => {
    const target = event.target as typeof event.target & {
      slug: { value: string };
    };
    const slugOrShort = target.slug.value;
    event.preventDefault();
    event.stopPropagation();
    if (slugOrShort) {
      await getTournament(slugOrShort);
      close();
    }
  };

  return (
    <>
      <DialogContent sx={{ pl: 2, pr: 2, pt: 2 }}>
        <form
          style={{
            alignItems: 'center',
            display: 'flex',
            margin: '8px 24px',
            gap: '8px',
          }}
          onSubmit={getTournamentOnSubmit}
        >
          <TextField
            label="Tournament Slug"
            name="slug"
            placeholder="super-smash-con-2023"
            size="small"
            variant="outlined"
          />
          <Button
            disabled={gettingTournament}
            endIcon={gettingTournament && <CircularProgress size="24px" />}
            type="submit"
            variant="contained"
          >
            Get!
          </Button>
          {gettingAdminedTournaments ? (
            <CircularProgress size="24px" style={{ padding: '8px' }} />
          ) : (
            <Tooltip arrow title="Get tournaments">
              <IconButton
                style={{
                  marginLeft: 'auto',
                }}
                onClick={() => {
                  setGettingAdminedTournaments(true);
                  window.electron.getAdminedTournaments().then(() => {
                    setGettingAdminedTournaments(false);
                  });
                }}
              >
                <Refresh />
              </IconButton>
            </Tooltip>
          )}
        </form>
        {gettingAdminedTournaments && adminedTournaments.length === 0 ? (
          <Stack direction="row" margin="8px 24px" spacing="8px">
            <CircularProgress size="24px" />
            <DialogContentText>
              Getting admined tournaments...
            </DialogContentText>
          </Stack>
        ) : (
          adminedTournaments.map((adminedTournament) => (
            <ListItemButton
              key={adminedTournament.slug}
              style={{ paddingLeft: '24px', paddingRight: '24px' }}
              onClick={async () => {
                await getTournament(adminedTournament.slug);
                close();
              }}
            >
              <ListItemText
                style={{ overflowX: 'hidden', whiteSpace: 'nowrap' }}
              >
                {adminedTournament.name}{' '}
                <Typography variant="caption">
                  ({adminedTournament.slug})
                </Typography>
              </ListItemText>
            </ListItemButton>
          ))
        )}
      </DialogContent>
    </>
  );
}
