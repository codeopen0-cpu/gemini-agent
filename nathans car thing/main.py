import time
import json
import paho.mqtt.client as mqtt
import RPi.GPIO as GPIO
from ultralytics import YOLO
RELAY_PIN = 18
GPIO.setmode(GPIO.BCM)
GPIO.setup(RELAY_PIN, GPIO.OUT)
model = YOLO('yolov8n.pt')
def on_message(client, userdata, msg):
payload = json.loads(msg.payload)
if payload.get("type") == "animal":
trigger_countermeasure(duration=2)
elif payload.get("type") == "human":
print("Human detected: Tactical Zone Offline")
GPIO.output(RELAY_PIN, GPIO.LOW)
def trigger_countermeasure(duration):
GPIO.output(RELAY_PIN, GPIO.HIGH)
time.sleep(duration)
GPIO.output(RELAY_PIN, GPIO.LOW)
client = mqtt.Client()
client.on_message = on_message
client.connect("localhost", 1883, 60)
client.subscribe("/sensors/+/+")
client.loop_forever()