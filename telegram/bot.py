#!/usr/bin/env python3
"""
Gobernator Telegram Bot — alerts, verificador, and quiniela updates.

Setup:
  1. Talk to @BotFather on Telegram, /newbot, get token
  2. Create .env file: TELEGRAM_BOT_TOKEN=your_token_here
  3. Run: python telegram/bot.py
  4. Send /start to your bot — it will reply with your chat_id
  5. Add TELEGRAM_CHAT_ID=your_chat_id to .env
  6. Now the bot can send you proactive alerts

Usage:
  python telegram/bot.py              # Run interactive bot
  python telegram/bot.py alert "msg"  # Send one-off alert
  python telegram/bot.py schedule     # Schedule J61 alerts
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

# Load config
ENV_FILE = Path(__file__).parent.parent / ".env"
CONFIG_FILE = Path(__file__).parent / "config.json"


def load_env():
    """Load .env file if exists."""
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())


def get_token() -> str:
    load_env()
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        print("ERROR: Set TELEGRAM_BOT_TOKEN in .env file")
        print("  1. Talk to @BotFather on Telegram")
        print("  2. /newbot → get token")
        print("  3. Create .env: TELEGRAM_BOT_TOKEN=your_token")
        sys.exit(1)
    return token


def get_chat_id() -> str:
    load_env()
    return os.environ.get("TELEGRAM_CHAT_ID", "")


def save_chat_id(chat_id: str):
    """Save chat_id to .env for future use."""
    if ENV_FILE.exists():
        content = ENV_FILE.read_text()
        if "TELEGRAM_CHAT_ID" not in content:
            ENV_FILE.write_text(content + f"\nTELEGRAM_CHAT_ID={chat_id}\n")
    else:
        ENV_FILE.write_text(f"TELEGRAM_CHAT_ID={chat_id}\n")


# ── Bot Commands ──

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    save_chat_id(str(chat_id))
    await update.message.reply_text(
        f"🏟️ Gobernator Bot activado.\n"
        f"Tu chat_id: {chat_id}\n\n"
        f"Comandos:\n"
        f"/status — Estado del sistema\n"
        f"/j61 — Predicciones J61\n"
        f"/verificar — Verificador 24h\n"
        f"/brier — Último Brier score\n"
        f"/alerta — Test de alerta"
    )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    state_dir = Path(__file__).parent.parent / "state" / "data"

    # Check data files
    primera = "✅" if list(state_dir.glob("laliga_j*_*.json")) else "❌"
    segunda = "✅" if list(state_dir.glob("segunda_j*_*.json")) else "❌"
    quiniela = "✅" if list(state_dir.glob("quiniela_j*_*.json")) else "❌"
    history = "✅" if list((state_dir / "history").glob("*.json")) else "❌"

    await update.message.reply_text(
        f"📊 Estado del Sistema\n\n"
        f"Datos Primera: {primera}\n"
        f"Datos Segunda: {segunda}\n"
        f"Quiniela J61: {quiniela}\n"
        f"Histórico: {history}\n"
        f"Modelo: Position v2 (Brier 0.475)\n"
        f"Budget J61: 100€ (128 cols)\n"
        f"Cierre: 9 mayo 14:00"
    )


async def cmd_j61(update: Update, context: ContextTypes.DEFAULT_TYPE):
    fixtures_file = Path(__file__).parent.parent / "state" / "data" / "quiniela_j61_fixtures.json"
    if not fixtures_file.exists():
        await update.message.reply_text("❌ No hay fixtures de J61")
        return

    with open(fixtures_file) as f:
        data = json.load(f)

    lines = ["🏟️ QUINIELA J61 — 15 partidos\n"]
    for m in data["matches"]:
        lines.append(f"P{m['num']:>2} {m['home'][:12]:>12} - {m['away'][:12]:<12}")

    lines.append(f"\n💰 Bote: {data.get('bote', '?'):,}€")
    lines.append(f"⏰ Cierre: {data.get('cierre_apuestas', '?')}")
    lines.append(f"💶 Budget: 100€ (128 cols)")

    await update.message.reply_text("\n".join(lines))


async def cmd_verificar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🔍 VERIFICADOR 24H — Ejecutando...\n\n"
        "Checklist:\n"
        "□ Mbappé fitness (test 6 mayo)\n"
        "□ Atlético partido europeo\n"
        "□ Villarreal partido europeo\n"
        "□ Convocatorias oficiales\n"
        "□ Lesiones últimas hora\n\n"
        "Para ejecutar verificación completa,\n"
        "abre Claude Code y di:\n"
        "'ejecuta verificador J61'"
    )


async def cmd_brier(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "📈 Calibración actual:\n\n"
        "Backtest J33-J34:\n"
        "  Position v2: Brier 0.475 ✅\n"
        "  Poisson: Brier 0.723 ❌\n"
        "  Random: Brier 0.667\n\n"
        "Edge: +19.2pp sobre random\n"
        "Accuracy: 60% (vs 33% random)"
    )


async def cmd_alerta(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("✅ Test de alerta recibido. El bot funciona.")


# ── Proactive alerts ──

async def send_alert(token: str, chat_id: str, message: str):
    """Send a one-off alert message."""
    from telegram import Bot
    bot = Bot(token=token)
    await bot.send_message(chat_id=chat_id, text=message)
    print(f"Alert sent to {chat_id}")


async def schedule_j61_alerts(token: str, chat_id: str):
    """Schedule alerts for J61."""
    from telegram import Bot
    bot = Bot(token=token)

    alerts = [
        {
            "time": "2026-05-08 21:00",
            "message": (
                "⚠️ ALERTA J61 — Verificador 24h\n\n"
                "Cierre mañana 14:00.\n"
                "Abre Claude Code y ejecuta verificador.\n\n"
                "Checklist:\n"
                "• Mbappé ¿juega?\n"
                "• Atlético ¿partido europeo?\n"
                "• Convocatorias oficiales\n"
                "• Lesiones última hora"
            ),
        },
        {
            "time": "2026-05-09 10:00",
            "message": (
                "🚨 J61 CIERRA EN 4 HORAS\n\n"
                "¿Has rellenado la quiniela?\n"
                "Budget: 100€ | 128 columnas\n"
                "Web: loteriasyapuestas.es\n\n"
                "6 fijos + 7 dobles"
            ),
        },
        {
            "time": "2026-05-09 13:00",
            "message": (
                "🔴 J61 CIERRA EN 1 HORA\n\n"
                "ÚLTIMO AVISO.\n"
                "Si no has sellado, hazlo AHORA.\n"
                "loteriasyapuestas.es"
            ),
        },
    ]

    now = datetime.now()
    for alert in alerts:
        alert_time = datetime.strptime(alert["time"], "%Y-%m-%d %H:%M")
        delay = (alert_time - now).total_seconds()
        if delay > 0:
            print(f"Scheduled: {alert['time']} (in {delay/3600:.1f}h)")
            await asyncio.sleep(delay)
            await bot.send_message(chat_id=chat_id, text=alert["message"])
            print(f"Sent: {alert['time']}")
        else:
            print(f"Skipped (past): {alert['time']}")


# ── Main ──

def run_bot():
    """Run the interactive bot."""
    token = get_token()
    app = Application.builder().token(token).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("j61", cmd_j61))
    app.add_handler(CommandHandler("verificar", cmd_verificar))
    app.add_handler(CommandHandler("brier", cmd_brier))
    app.add_handler(CommandHandler("alerta", cmd_alerta))

    print("Bot running... Send /start to your bot on Telegram")
    app.run_polling()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        token = get_token()
        chat_id = get_chat_id()

        if cmd == "alert" and len(sys.argv) > 2:
            if not chat_id:
                print("ERROR: Run bot first and /start to get chat_id")
                sys.exit(1)
            msg = " ".join(sys.argv[2:])
            asyncio.run(send_alert(token, chat_id, msg))

        elif cmd == "schedule":
            if not chat_id:
                print("ERROR: Run bot first and /start to get chat_id")
                sys.exit(1)
            print("Scheduling J61 alerts...")
            asyncio.run(schedule_j61_alerts(token, chat_id))

        elif cmd == "test":
            print(f"Token: {'***' + token[-6:]}")
            print(f"Chat ID: {chat_id or 'NOT SET'}")
            print("Run the bot and /start to set chat_id")

        else:
            print(__doc__)
    else:
        run_bot()
