# Server Script: bim_iot_sync
# Type: API
# Event: Before Insert
# API: /api/method/bim_iot_sync

# ES BIM Phase 4 — IoT Sensor Sync API
# Endpoint: /api/method/bim_iot_sync
# Args: bim_project (optional, syncs all projects if omitted)
#
# For each active BIM IoT Sensor Link, fetches the latest Beacon Sensor Log
# entry and returns the current readings. Also writes last_* fields back.
# Called from the IoT panel client script on a refresh cycle.

def sync_sensors(bim_project):
    filters = {'active': 1}
    if bim_project:
        filters['bim_project'] = bim_project

    links = frappe.get_all('BIM IoT Sensor Link',
        filters=filters,
        fields=['name','link_name','vehicle_beacon','beacon_mac',
                'ifc_guid','element_description','floor_level',
                'monitoring_purpose','alert_threshold_temp','sensor_type'])

    results = []

    for link in links:
        reading = None
        beacon_name = link.get('vehicle_beacon')

        if beacon_name:
            # Get latest log entry for this beacon
            logs = frappe.get_all('Beacon Sensor Log',
                filters={'beacon_name': beacon_name},
                fields=['name','log_datetime','temperature','humidity',
                        'battery','rssi','motion','latitude','longitude','device_status'],
                order_by='log_datetime desc',
                limit=1)

            if logs:
                reading = logs[0]

        if reading:
            temp = reading.get('temperature') or 0
            threshold = link.get('alert_threshold_temp')
            in_alert = threshold and float(temp) > float(threshold)
            status = 'Alert' if in_alert else (reading.get('device_status') or 'Online')

            # Update last readings on the link record
            frappe.db.set_value('BIM IoT Sensor Link', link['name'], {
                'last_temperature':      temp,
                'last_humidity':         reading.get('humidity') or 0,
                'last_battery':          reading.get('battery') or 0,
                'last_reading_datetime': reading.get('log_datetime'),
                'last_status':           status
            })
            frappe.db.commit()

            results.append({
                'link_name':     link['link_name'],
                'ifc_guid':      link['ifc_guid'],
                'element':       link.get('element_description',''),
                'floor_level':   link.get('floor_level',''),
                'purpose':       link.get('monitoring_purpose',''),
                'sensor_type':   link.get('sensor_type',''),
                'temperature':   temp,
                'humidity':      reading.get('humidity') or 0,
                'battery':       reading.get('battery') or 0,
                'rssi':          reading.get('rssi') or 0,
                'motion':        reading.get('motion') or 0,
                'latitude':      reading.get('latitude') or 0,
                'longitude':     reading.get('longitude') or 0,
                'log_datetime':  str(reading.get('log_datetime','')),
                'status':        status,
                'in_alert':      in_alert
            })
        else:
            results.append({
                'link_name':   link['link_name'],
                'ifc_guid':    link['ifc_guid'],
                'element':     link.get('element_description',''),
                'floor_level': link.get('floor_level',''),
                'purpose':     link.get('monitoring_purpose',''),
                'sensor_type': link.get('sensor_type',''),
                'status':      'Offline',
                'in_alert':    False
            })

    frappe.response['message'] = {
        'synced': len(results),
        'sensors': results
    }


bim_project = frappe.form_dict.get('bim_project', '')
sync_sensors(bim_project)