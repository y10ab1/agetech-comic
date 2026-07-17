# PocketBase（無官方 image，用釋出的執行檔）。版本務必 pin（PB 尚未 1.0）。
FROM alpine:3.20

ARG PB_VERSION=0.39.7

RUN apk add --no-cache ca-certificates unzip wget \
    && wget https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip \
    && unzip pocketbase_${PB_VERSION}_linux_amd64.zip -d /pb \
    && rm pocketbase_${PB_VERSION}_linux_amd64.zip

EXPOSE 8090

# 綁 0.0.0.0 讓 compose 網路內其他服務可連
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
