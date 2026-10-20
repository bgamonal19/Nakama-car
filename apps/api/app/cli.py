"""Recovery for workshop accounts when nobody can log in any more.

Run where the API's DATABASE_URL is set (Railway/Vercel shell or locally with the production URL):

    python -m app.cli list-staff
    python -m app.cli reset-password admin@example.com 'NewPassword2026!'

The reset also reactivates the account and logs out its old sessions.
"""
import argparse
import sys

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.identity import Role, User, UserRole, UserStatus
from app.security.passwords import hash_password


def list_staff(db: Session) -> list[str]:
    lines = []
    for user in db.scalars(select(User).order_by(User.email)):
        roles = db.scalars(select(Role.code).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == user.id)).all()
        lines.append(f"{user.email}  {user.status.value}  {','.join(sorted(roles)) or '-'}")
    return lines


def reset_password(db: Session, email: str, password: str) -> User:
    if len(password) < 10:
        raise ValueError("La password deve avere almeno 10 caratteri.")
    user = db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))
    if user is None:
        raise LookupError(f"Nessun account del personale con email {email}.")
    user.password_hash = hash_password(password)
    user.status = UserStatus.ACTIVE
    user.auth_version += 1
    db.commit()
    return user


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list-staff", help="Email, stato e ruoli degli account del personale")
    reset = commands.add_parser("reset-password", help="Nuova password e account riattivato")
    reset.add_argument("email")
    reset.add_argument("password")
    args = parser.parse_args(argv)

    from app.db.session import SessionLocal

    with SessionLocal() as db:
        if args.command == "list-staff":
            print("\n".join(list_staff(db)) or "Nessun account.")
            return 0
        try:
            user = reset_password(db, args.email, args.password)
        except (LookupError, ValueError) as error:
            print(error, file=sys.stderr)
            return 1
        print(f"Password aggiornata e account attivo: {user.email}")
        return 0


if __name__ == "__main__":
    sys.exit(main())
