#!/usr/bin/env python3
"""
Gobernator Telegram Bot — using raw HTTP API (no dependencies beyond requests).

Setup:
  1. Set TELEGRAM_BOT_TOKEN in .env
  2. Run: python telegram/bot.py start
  3. Send /start to @Joan_Trading_Bot on Telegram
  4. Bot saves your chat_id
  5. Now: python telegram/bot.py alert "your message"

Commands:
  python telegram/bot.py start        # Run polling bot
  python telegram/bot.py alert "msg"  # Send one-off message
  python telegram/bot.py schedule     # Schedule J61 alerts
  python telegram/bot.py test         # Test connection
"""

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import requests as req

ROOT = Path(__file__).parent.parent
ENV_FILE = ROOT / ".env"
STATE_FILE = Path(__file__).parent / "state.json"

API_BASE = "https://api.telegram.org/bot{token}/{method}"


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())


def get_token() -> str:
    load_env()
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        print("ERROR: Set TELEGRAM_BOT_TOKEN in .env")
        sys.exit(1)
    return token


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"chat_id": None, "last_update_id": 0}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def api_call(token: str, method: str, data: dict = None) -> dict:
    url = API_BASE.format(token=token, method=method)
    if data:
        resp = req.post(url, json=data, timeout=30)
    else:
        resp = req.get(url, timeout=30)
    return resp.json()


def send_message(token: str, chat_id: str, text: str) -> bool:
    result = api_call(token, "sendMessage", {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
    })
    return result.get("ok", False)


def handle_message(token: str, state: dict, message: dict):
    chat_id = str(message["chat"]["id"])
    text = message.get("text", "")
    user = message.get("from", {}).get("first_name", "?")

    if not state.get("chat_id"):
        state["chat_id"] = chat_id
        save_state(state)
        print(f"Chat ID saved: {chat_id}")

    if text == "/start":
        send_message(token, chat_id,
            f"🏟️ *Gobernator Bot activado*\n"
            f"Hola {user}. Tu chat\\_id: `{chat_id}`\n\n"
            f"Comandos:\n"
            f"/status — Estado del sistema\n"
            f"/j61 — Predicciones J61\n"
            f"/verificar — Checklist pre-cierre\n"
            f"/brier — Calibración del modelo\n"
            f"/ping — Test de conexión"
        )

    elif text == "/status":
        send_message(token, chat_id,
            f"📊 *Estado del Sistema*\n\n"
            f"✅ Primera: 20/20 equipos verificados\n"
            f"✅ Segunda: 22/22 equipos verificados\n"
            f"✅ Histórico: 100 partidos (J25-J34)\n"
            f"✅ Modelo: Position v2 (Brier 0.475)\n"
            f"✅ Quiniela J61: 15 partidos\n\n"
            f"💶 Budget J61: 100€ (128 cols)\n"
            f"⏰ Cierre: 9 mayo 14:00\n"
            f"💰 Bote: 1.900.000€"
        )

    elif text == "/j61":
        fixtures_file = ROOT / "state" / "data" / "quiniela_j61_fixtures.json"
        if fixtures_file.exists():
            data = json.loads(fixtures_file.read_text())
            lines = ["🏟️ *QUINIELA J61*\n"]
            for m in data["matches"]:
                lines.append(f"`P{m['num']:>2}` {m['home'][:14]} - {m['away'][:14]}")
            lines.append(f"\n💰 Bote: {data.get('bote', '?'):,}€")
            lines.append(f"⏰ Cierre: {data.get('cierre_apuestas', '?')}")
            send_message(token, chat_id, "\n".join(lines))
        else:
            send_message(token, chat_id, "❌ No hay fixtures J61")

    elif text == "/verificar":
        send_message(token, chat_id,
            "🔍 *VERIFICADOR 24H — J61*\n\n"
            "Checklist pre-cierre:\n"
            "□ Mbappé fitness (test 6 mayo)\n"
            "□ Atlético partido europeo\n"
            "□ Villarreal partido europeo\n"
            "□ Convocatorias oficiales\n"
            "□ Lesiones última hora\n\n"
            "6 FIJOS: Elche, Athletic, Rayo, Málaga, Córdoba, Barça\n"
            "9 DOBLES: resto\n"
            "128 columnas = 100€"
        )

    elif text == "/brier":
        send_message(token, chat_id,
            "📈 *Calibración del modelo*\n\n"
            "Backtest J33-J34 (20 partidos):\n"
            "  Position v2: *Brier 0.475* ✅\n"
            "  Poisson roto: Brier 0.723 ❌\n"
            "  Random: Brier 0.667\n\n"
            "Edge: *+19.2pp* sobre random\n"
            "Accuracy: *60%* (vs 33%)\n\n"
            "Objetivo: Brier < 0.40"
        )

    elif text == "/ping":
        send_message(token, chat_id, "🏓 Pong. Bot operativo.")

    else:
        send_message(token, chat_id, f"No entiendo: {text}\nUsa /start para ver comandos.")


def run_polling(token: str):
    """Simple long-polling bot."""
    state = load_state()
    print(f"Bot running... Chat ID: {state.get('chat_id', 'NOT SET')}")
    print("Send /start to @Joan_Trading_Bot on Telegram")

    while True:
        try:
            updates = api_call(token, "getUpdates", {
                "offset": state.get("last_update_id", 0) + 1,
                "timeout": 30,
            })

            if updates.get("ok") and updates.get("result"):
                for update in updates["result"]:
                    state["last_update_id"] = update["update_id"]
                    if "message" in update:
                        handle_message(token, state, update["message"])
                        save_state(state)

        except req.exceptions.ConnectionError:
            print("Connection error, retrying in 5s...")
            time.sleep(5)
        except req.exceptions.Timeout:
            pass
        except KeyboardInterrupt:
            print("\nBot stopped.")
            break


def schedule_alerts(token: str, chat_id: str):
    """Send scheduled alerts for J61."""
    alerts = [
        ("2026-05-08 21:00", "⚠️ *ALERTA J61 — Verificador 24h*\n\nCierre mañana 14:00.\nAbre Claude Code y ejecuta verificador.\n\n• Mbappé ¿juega?\n• Atlético ¿partido europeo?\n• Convocatorias oficiales"),
        ("2026-05-09 10:00", "🚨 *J61 CIERRA EN 4 HORAS*\n\n¿Has rellenado la quiniela?\nBudget: 100€ | 128 columnas\nloteriasyapuestas.es"),
        ("2026-05-09 13:00", "🔴 *ÚLTIMO AVISO — J61 cierra en 1h*\n\nSi no has sellado, hazlo AHORA.\nloteriasyapuestas.es"),
    ]

    now = datetime.now()
    for alert_time_str, message in alerts:
        alert_time = datetime.strptime(alert_time_str, "%Y-%m-%d %H:%M")
        delay = (alert_time - now).total_seconds()
        if delay > 0:
            hours = delay / 3600
            print(f"⏰ Programada: {alert_time_str} (en {hours:.1f}h)")
        else:
            print(f"⏭️  Saltada (pasada): {alert_time_str}")

    # Actually wait and send
    for alert_time_str, message in alerts:
        alert_time = datetime.strptime(alert_time_str, "%Y-%m-%d %H:%M")
        delay = (alert_time - now).total_seconds()
        if delay > 0:
            print(f"Esperando {delay/3600:.1f}h para: {alert_time_str}")
            time.sleep(delay)
            send_message(token, chat_id, message)
            print(f"✅ Enviada: {alert_time_str}")
            now = datetime.now()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    cmd = sys.argv[1]
    token = get_token()
    state = load_state()

    if cmd == "start":
        run_polling(token)

    elif cmd == "test":
        result = api_call(token, "getMe")
        if result.get("ok"):
            bot = result["result"]
            print(f"✅ Bot: @{bot['username']} ({bot['first_name']})")
            print(f"Chat ID: {state.get('chat_id', 'NOT SET — run start first')}")
        else:
            print(f"❌ Error: {result}")

    elif cmd == "alert":
        chat_id = state.get("chat_id")
        if not chat_id:
            print("ERROR: Run 'start' first and /start in Telegram")
            sys.exit(1)
        msg = " ".join(sys.argv[2:])
        if send_message(token, chat_id, msg):
            print(f"✅ Enviado a {chat_id}")
        else:
            print("❌ Error enviando")

    elif cmd == "schedule":
        chat_id = state.get("chat_id")
        if not chat_id:
            print("ERROR: Run 'start' first and /start in Telegram")
            sys.exit(1)
        schedule_alerts(token, chat_id)

    else:
        print(f"Unknown: {cmd}")
        print(__doc__)
