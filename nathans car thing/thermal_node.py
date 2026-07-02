import cv2
from ultralytics import YOLO
import paho.mqtt.client as mqtt
import yaml

with open("config.yaml", "r") as f:
    config = yaml.safe_load(f)

client = mqtt.Client()
client.connect(config['mqtt']['broker'], config['mqtt']['port'])

model = YOLO('yolov8n.pt')

def process_stream(source_id, topic):
    cap = cv2.VideoCapture(source_id)
    while True:
        ret, frame = cap.read()
        if not ret: break
        results = model(frame)
        for r in results:
            if len(r.boxes) > 0:
                client.publish(topic, "detection_active")
    cap.release()
