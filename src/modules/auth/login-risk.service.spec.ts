import { DatabaseService } from '../../common/database/database.service';
import { LoginRiskService } from './login-risk.service';

describe('LoginRiskService', () => {
  it('allows the first device and recognizes a known context', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          deviceId: 'android-kigali-0001',
          ipHash: 'ip-1',
          userAgentHash: 'agent-1',
        },
      ]);
    const service = new LoginRiskService({
      authSession: { findMany },
    } as unknown as DatabaseService);
    const input = {
      userId: 'user-1',
      deviceId: 'android-kigali-0001',
      ipHash: 'ip-1',
      userAgentHash: 'agent-1',
    };

    await expect(service.assess(input)).resolves.toEqual({
      level: 'LOW',
      reason: null,
    });
    await expect(service.assess(input)).resolves.toEqual({
      level: 'LOW',
      reason: null,
    });
  });

  it('elevates a new device without exposing raw context', async () => {
    const service = new LoginRiskService({
      authSession: {
        findMany: jest.fn().mockResolvedValue([
          {
            deviceId: 'known-device',
            ipHash: 'known-ip',
            userAgentHash: 'known-agent',
          },
        ]),
      },
    } as unknown as DatabaseService);

    await expect(
      service.assess({
        userId: 'user-1',
        deviceId: 'new-device',
        ipHash: 'new-ip',
        userAgentHash: 'new-agent',
      }),
    ).resolves.toEqual({ level: 'ELEVATED', reason: 'NEW_DEVICE' });
  });
});
