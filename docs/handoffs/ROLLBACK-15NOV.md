# Rollback values, recorded Sun 15 Nov 2026 before deploy (read-only reads)

- `workwithvineeth/pickleq` branch `rallyq-live`: b2be33935ae5db9912b69102813195c3fc33c250 (committed 2026-11-14T10:08:05Z)
- `workwithvineeth/pqclub` file `club-ref`: b2be33935ae5db9912b69102813195c3fc33c250
- `workwithvineeth/pqclub` main HEAD: 2bff9945a80059119e1f8aef0c22030d7e2d45dc

Rollback: push the `rallyq-live` sha above back to `rallyq-live`, write the same sha to `pqclub/club-ref`, push pqclub main, wait for green, tell Nehemiah.

## Second deploy, S5 admin command centre (Sun 15 Nov, about 05:10 IST)
- Previous `rallyq-live` and `club-ref` (roll back to this): 9ed0a4750b3ae9067e0be0086b63f3c9ad1b07f0
- New: a01e82704afcc746e7679e702a08db1e4b6c0baf
- S5 migration applied live before this deploy (7 admin_* functions). It only adds functions, so rolling the code back is safe; the functions stay and are guarded to platform admins.
