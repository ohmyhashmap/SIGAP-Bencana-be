pipeline {
    agent any

    options {
        timestamps()
        skipDefaultCheckout(true)
        disableConcurrentBuilds(abortPrevious: true)
        skipStagesAfterUnstable()
    }

    stages {
        stage('Checkout') {
            agent {
                docker {
                    image 'node:22-alpine'
                    reuseNode true
                }
            }
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            agent {
                docker {
                    image 'node:22-alpine'
                    reuseNode true
                }
            }
            steps {
                sh 'npm ci'
            }
        }

        stage('Test') {
            agent {
                docker {
                    image 'node:22-alpine'
                    reuseNode true
                }
            }
            steps {
                sh '''
                    set -eu

                    if [ -z "${TEST_DATABASE_URL:-}" ]; then
                        echo "TEST_DATABASE_URL is not set; database integration tests will be skipped."
                    fi

                    npm test
                '''
            }
        }

        stage('Trivy Security Scan') {
            agent {
                docker {
                    image 'aquasec/trivy:0.74.0'
                    reuseNode true
                    args '''
                        --entrypoint=""
                        -e HOME=/tmp
                        -e XDG_CACHE_HOME=/tmp/.cache
                    '''
                }
            }
            steps {
                sh '''
                    set -eu

                    trivy fs \
                        --scanners vuln \
                        --severity HIGH,CRITICAL \
                        --format sarif \
                        --output trivy-results.sarif \
                        --exit-code 1 \
                        .
                '''
            }
            post {
                always {
                    recordIssues(
                        enabledForFailure: true,
                        failOnError: false,
                        tools: [
                            sarif(
                                id: 'trivy',
                                name: 'Trivy Security',
                                pattern: 'trivy-results.sarif'
                            )
                        ]
                    )
                }
            }
        }

        stage('SonarQube Analysis') {
            agent {
                docker {
                    image 'sonarsource/sonar-scanner-cli:latest'
                    reuseNode true
                    args '--network cicd-network'
                }
            }
            steps {
                withSonarQubeEnv('SonarQube') {
                    sh '''
                        set -eu

                        sonar-scanner \
                            -Dsonar.projectKey=sigap-bencana-backend \
                            -Dsonar.sources=src \
                            -Dsonar.tests=test \
                            -Dsonar.test.inclusions="test/**/*.test.js" \
                            -Dsonar.javascript.node.maxspace=2048
                    '''
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Package Backend') {
            agent {
                docker {
                    image 'node:22-alpine'
                    reuseNode true
                    args '-u root'
                }
            }
            steps {
                sh '''
                    set -eu

                    apk add --no-cache zip unzip
                    rm -f latest-backend.zip

                    zip -r latest-backend.zip . \
                        -x "node_modules/*" \
                        -x "*/node_modules/*" \
                        -x ".git/*" \
                        -x ".env" \
                        -x ".env.*" \
                        -x "coverage/*" \
                        -x ".trivy-cache/*" \
                        -x "latest-backend.zip" \
                        -x "trivy-results.sarif"

                    unzip -l latest-backend.zip
                '''
            }
        }

        stage('Publish Backend Artifact') {
            steps {
                archiveArtifacts(
                    artifacts: 'latest-backend.zip',
                    fingerprint: true,
                    allowEmptyArchive: false
                )

                script {
                    def appName = env.JOB_NAME
                        .replaceAll('[^a-zA-Z0-9._-]', '-')
                        .replaceAll('-+', '-')
                        .replaceAll('^-|-$', '')
                    def buildId = env.BUILD_NUMBER
                    def jenkinsBaseUrl = env.BUILD_URL
                        .substring(0, env.BUILD_URL.indexOf('/job/'))
                        .replace('localhost', 'host.docker.internal')

                    env.ARTIFACT_URL =
                        "${jenkinsBaseUrl}/userContent/applications/${appName}/${buildId}/latest-backend.zip"

                    sh """
                        set -eu
                        docker exec cicd-jenkins mkdir -p \
                            "/var/jenkins_home/userContent/applications/${appName}/${buildId}"
                        docker cp latest-backend.zip \
                            "cicd-jenkins:/var/jenkins_home/userContent/applications/${appName}/${buildId}/latest-backend.zip"
                    """
                    echo "Backend artifact published for build ${buildId}."
                }
            }
        }

        stage('Deploy Backend') {
            agent {
                docker {
                    image 'curlimages/curl:8.15.0'
                    reuseNode true
                    args '--network cicd-network'
                }
            }
            steps {
                script {
                    if (!env.URL_REDEPLOY || !env.URL_PROGRESS || !env.DEPLOY_TOKEN || !env.WEBSITE_ID) {
                        error('Set URL_REDEPLOY, URL_PROGRESS, DEPLOY_TOKEN, and the backend WEBSITE_ID in Jenkins.')
                    }

                    sh '''
                        set -eu
                        curl -sS --fail-with-body \
                            -X POST "$URL_REDEPLOY" \
                            -H "Content-Type: application/json" \
                            -d "{\"token_access\":\"$DEPLOY_TOKEN\",\"website_id\":\"$WEBSITE_ID\",\"source_url\":\"$ARTIFACT_URL\",\"source_type\":\"jenkins\"}"
                    '''

                    def status = 'IN_PROGRESS'
                    for (int attempt = 1; attempt <= 120 && status == 'IN_PROGRESS'; attempt++) {
                        sleep time: 5, unit: 'SECONDS'

                        def response = sh(
                            script: '''
                                set -eu
                                curl -sS --fail-with-body \
                                    -X POST "$URL_PROGRESS" \
                                    -H "Content-Type: application/json" \
                                    -d "{\"token_access\":\"$DEPLOY_TOKEN\",\"website_id\":\"$WEBSITE_ID\"}"
                            ''',
                            returnStdout: true
                        ).trim()
                        def result = readJSON text: response
                        status = result?.data?.status?.toString()?.toUpperCase()

                        if (!status) {
                            error('Deployment progress response is missing data.status.')
                        }
                        if (status == 'FAIL') {
                            echo result?.data?.log ?: 'Backend deployment failed without a log.'
                            error("Backend deployment failed for website ${env.WEBSITE_ID}.")
                        }
                    }

                    if (status != 'SUCCESS') {
                        error('Backend deployment timed out after 10 minutes.')
                    }
                    echo 'Backend deployment succeeded.'
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts(
                artifacts: 'trivy-results.sarif',
                allowEmptyArchive: true
            )
        }
        success {
            echo "Backend pipeline succeeded. Artifact: ${env.ARTIFACT_URL ?: '(not published)'}"
        }
        failure {
            echo 'Backend pipeline failed. Check the stage logs for details.'
        }
    }
}
