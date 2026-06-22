import boto3
try:
    s3 = boto3.client('s3', endpoint_url='http://localhost:9000', aws_access_key_id='minioadmin', aws_secret_access_key='minioadmin')
    buckets = s3.list_buckets().get('Buckets', [])
    for b in buckets:
        print(f"Bucket: {b['Name']}")
        try:
            objs = s3.list_objects_v2(Bucket=b['Name']).get('Contents', [])
            print(f"  Objects count: {len(objs)}")
        except Exception as e:
            print(f"  Error listing objects: {e}")
except Exception as e:
    print(f"Error connecting: {e}")
