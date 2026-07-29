import { buildCorsOptions } from './cors.config';

describe('buildCorsOptions', () => {
  const options = buildCorsOptions(
    'https://user.mucyora.example,https://admin.mucyora.example',
  );

  it('allows configured origins with credentials', (done) => {
    expect(options.credentials).toBe(true);
    expect(typeof options.origin).toBe('function');

    if (typeof options.origin !== 'function') {
      done.fail('CORS origin callback was not configured');
      return;
    }

    options.origin('https://user.mucyora.example', (error, allowed) => {
      expect(error).toBeNull();
      expect(allowed).toBe(true);
      done();
    });
  });

  it('rejects unconfigured origins', (done) => {
    if (typeof options.origin !== 'function') {
      done.fail('CORS origin callback was not configured');
      return;
    }

    options.origin('https://attacker.example', (error, allowed) => {
      expect(error).toBeInstanceOf(Error);
      expect(allowed).toBe(false);
      done();
    });
  });
});
