import { PermissionsAndroid, Platform } from 'react-native';

import { UsageStats } from '../../modules/usage-stats';
import { askForNudgesOnce } from '../state/nudges';

const onAndroid = (version: number) => {
  jest.replaceProperty(Platform, 'OS', 'android');
  // Version is a getter on the Platform module, so it is spied, not replaced.
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version);
};

const native = (s: { prompted?: boolean; enabled?: boolean; allowed?: boolean }) => {
  jest.spyOn(UsageStats, 'nudgesPrompted').mockReturnValue(s.prompted ?? false);
  jest.spyOn(UsageStats, 'nudgesEnabled').mockReturnValue(s.enabled ?? true);
  jest.spyOn(UsageStats, 'notificationsAllowed').mockReturnValue(s.allowed ?? false);
  return {
    mark: jest.spyOn(UsageStats, 'markNudgesPrompted').mockImplementation(() => {}),
    setEnabled: jest.spyOn(UsageStats, 'setNudgesEnabled').mockImplementation(() => {}),
  };
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('asking for notification permission', () => {
  it('asks once on Android 13+, and keeps nudges on when allowed', async () => {
    onAndroid(34);
    const n = native({});
    const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

    await askForNudgesOnce();

    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    expect(n.mark).toHaveBeenCalled();
    expect(n.setEnabled).not.toHaveBeenCalled();
  });

  it('switches nudges off when the user declines, so the switch never claims otherwise', async () => {
    onAndroid(34);
    const n = native({});
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

    await askForNudgesOnce();

    expect(n.setEnabled).toHaveBeenCalledWith(false);
  });

  it('never asks a second time', async () => {
    onAndroid(34);
    native({ prompted: true });
    const request = jest.spyOn(PermissionsAndroid, 'request');

    await askForNudgesOnce();

    expect(request).not.toHaveBeenCalled();
  });

  it('does not ask if the user already switched nudges off', async () => {
    onAndroid(34);
    native({ enabled: false });
    const request = jest.spyOn(PermissionsAndroid, 'request');

    await askForNudgesOnce();

    expect(request).not.toHaveBeenCalled();
  });

  it('has nothing to ask below Android 13, where notifications are allowed by default', async () => {
    onAndroid(30);
    const n = native({ allowed: true });
    const request = jest.spyOn(PermissionsAndroid, 'request');

    await askForNudgesOnce();

    expect(request).not.toHaveBeenCalled();
    expect(n.setEnabled).not.toHaveBeenCalled();
  });

  it('does nothing off Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const n = native({});

    await askForNudgesOnce();

    expect(n.mark).not.toHaveBeenCalled();
  });
});
