from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import Transaction, User
from ..schemas import TransactionCreate, TransactionOut, TransactionSummary

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionOut])
async def list_transactions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    type: str | None = None,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=200, le=1000),
):
    stmt = select(Transaction).where(Transaction.user_id == user.id)
    if type:
        stmt = stmt.where(Transaction.type == type)
    if category:
        stmt = stmt.where(Transaction.category == category)
    if date_from:
        stmt = stmt.where(Transaction.txn_date >= date_from)
    if date_to:
        stmt = stmt.where(Transaction.txn_date <= date_to)
    stmt = stmt.order_by(Transaction.txn_date.desc(), Transaction.id.desc()).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=TransactionOut)
async def create_transaction(
    payload: TransactionCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    if payload.type not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="type must be 'income' or 'expense'")
    txn = Transaction(user_id=user.id, **payload.model_dump())
    db.add(txn)
    await db.commit()
    await db.refresh(txn)
    return txn


async def _get_owned_txn(txn_id: int, db: AsyncSession, user: User) -> Transaction:
    result = await db.execute(
        select(Transaction).where(Transaction.id == txn_id, Transaction.user_id == user.id)
    )
    txn = result.scalar_one_or_none()
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return txn


@router.put("/{txn_id}", response_model=TransactionOut)
async def update_transaction(
    txn_id: int,
    payload: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    txn = await _get_owned_txn(txn_id, db, user)
    for field, value in payload.model_dump().items():
        setattr(txn, field, value)
    await db.commit()
    await db.refresh(txn)
    return txn


@router.delete("/{txn_id}")
async def delete_transaction(
    txn_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    txn = await _get_owned_txn(txn_id, db, user)
    await db.delete(txn)
    await db.commit()
    return {"ok": True}


@router.get("/summary", response_model=TransactionSummary)
async def summary(
    period: str = Query(default_factory=lambda: date.today().strftime("%Y-%m")),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    year, month = (int(p) for p in period.split("-"))
    result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user.id,
            func.strftime("%Y-%m", Transaction.txn_date) == period,
        )
    )
    txns = result.scalars().all()
    total_income = sum(t.amount for t in txns if t.type == "income")
    total_expense = sum(t.amount for t in txns if t.type == "expense")
    by_category: dict[str, float] = {}
    for t in txns:
        if t.type == "expense":
            by_category[t.category] = by_category.get(t.category, 0.0) + t.amount
    return TransactionSummary(
        period=period,
        total_income=total_income,
        total_expense=total_expense,
        balance=total_income - total_expense,
        by_category=by_category,
    )
