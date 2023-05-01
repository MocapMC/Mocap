import { system, world } from '@minecraft/server';
import { Recording } from './classes/Recording';
import { PlaybackState } from './enums/PlaybackState';

const record = new Recording('test', 'overworld', {
  from: { x: 0, y: -64, z: 0 },
  to: { x: 64, y: 320, z: 64 },
});

world.beforeEvents.chatSend.subscribe((ev) => {
  const msg = ev.message;
  if (!msg.startsWith('!')) return;
  ev.cancel = true;
  const sender = ev.sender;

  system.runTimeout(() => {
    try {
      const args = msg.split(' ');
      const cmd = args[0].slice(1);

      switch (cmd) {
        case 'simulate': {
          if (record.state !== PlaybackState.none) {
            sender.sendMessage('Recording is already simulating or recording');
            return;
          }
          const reverse = (args[1] ?? '').toLowerCase() == 'reverse';
          record.startSimulating(reverse);
          sender.sendMessage('Simulation started');
          break;
        }
        case 'reset': {
          if (record.state !== PlaybackState.none) {
            sender.sendMessage('Recording is simulating or recording');
            return;
          }
          record.resetRecording();
          sender.sendMessage('Reset recording');
          break;
        }
        case 'record': {
          if (record.state !== PlaybackState.none) {
            sender.sendMessage('Recording is already simulating or recording');
            return;
          }
          record.startRecording();
          sender.sendMessage('Recording started');
          break;
        }
        case 'stop': {
          switch (record.state) {
            case PlaybackState.recording: {
              record.stopRecording();
              sender.sendMessage('Recording stopped recording');
              break;
            }
            case PlaybackState.simulating: {
              record.stopSimulating();
              sender.sendMessage('Recording stopped simulating');
              break;
            }
            case PlaybackState.none: {
              sender.sendMessage('Recording is not simulating or recording');
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, 0);
});
