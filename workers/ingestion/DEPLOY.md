# Cloud Run Job 배포 가이드

> Phase 1에서는 Docker 이미지 빌드까지만 수행합니다.
> 실제 배포와 Cloud Scheduler 등록은 Phase 2에서 진행합니다.

## 1. 로컬 Docker 빌드 + 테스트

```bash
# 프로젝트 루트에서 실행
docker build -t gh-radar-ingestion:local -f workers/ingestion/Dockerfile .

# 로컬 실행 (장 시간에만 데이터 수집)
docker run --rm --env-file workers/ingestion/.env gh-radar-ingestion:local
```

## 2. GCP Container Registry에 이미지 푸시

```bash
export PROJECT=your-gcp-project-id

gcloud builds submit --tag gcr.io/$PROJECT/gh-radar-ingestion
```

## 3. Cloud Run Job 생성

```bash
gcloud run jobs create gh-radar-ingestion \
  --image gcr.io/$PROJECT/gh-radar-ingestion \
  --region asia-northeast3 \
  --set-env-vars="SUPABASE_URL=https://ivdbzxgaapbmrxreyuht.supabase.co" \
  --set-env-vars="KIS_BASE_URL=https://openapi.koreainvestment.com:9443" \
  --set-env-vars="KIS_ACCOUNT_NUMBER=XXXXXXXX-XX" \
  --set-env-vars="LOG_LEVEL=info" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest" \
  --set-secrets="KIS_APP_KEY=kis-app-key:latest" \
  --set-secrets="KIS_APP_SECRET=kis-app-secret:latest" \
  --memory=512Mi \
  --cpu=1 \
  --max-retries=0 \
  --task-timeout=120s
```

## 4. 수동 실행 테스트

```bash
gcloud run jobs execute gh-radar-ingestion --region asia-northeast3
```

## 5. Cloud Scheduler 등록 (Phase 2)

```bash
# 평일 09:00~15:59 KST 매 분 + 15:35 종가 스냅샷
gcloud scheduler jobs create http gh-radar-ingestion-scheduler \
  --location=asia-northeast3 \
  --schedule="* 9-15 * * 1-5" \
  --time-zone="Asia/Seoul" \
  --uri="https://asia-northeast3-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/gh-radar-ingestion:run" \
  --oauth-service-account-email=YOUR_SERVICE_ACCOUNT@$PROJECT.iam.gserviceaccount.com
```

> Cloud Scheduler 등록은 Phase 2에서 Express API 서버와 함께 설정합니다.
