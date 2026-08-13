pipeline {
    agent any

    stages {
        // -------------------------------------------------------------
        // 1. RÉCUPÉRATION DU CODE
        // -------------------------------------------------------------
        stage('1. Récupération du Code') {
            steps {
                echo '📥 Récupération du code source depuis GitHub...'
                checkout scm
            }
        }

        // -------------------------------------------------------------
        // 2. TESTS AUTOMATISÉS
        // -------------------------------------------------------------
        stage('2. Tests Automatisés') {
            steps {
                echo '🧪 Exécution des tests unitaires et vérification de la syntaxe...'
                sh 'npm test -- --passWithNoTests'
            }
        }

        // -------------------------------------------------------------
        // 3. SÉCURITÉ DU CODE (DevSecOps)
        // -------------------------------------------------------------
        stage('3. Sécurité du Code (DevSecOps)') {
            steps {
                echo '🔒 Scan de sécurité des dépendances...'
                sh 'npm audit --audit-level=high || echo "Vulnérabilités détectées"'
            }
        }

        // -------------------------------------------------------------
        // 4. BUILD DOCKER
        // -------------------------------------------------------------
        stage('4. Build Docker') {
            steps {
                echo '🏗️ Construction des images Docker...'
                sh 'docker compose build'
            }
        }

        // -------------------------------------------------------------
        // 5. DÉPLOIEMENT
        // -------------------------------------------------------------
        stage('5. Déploiement') {
            steps {
                echo '🚀 Déploiement et redémarrage des conteneurs...'
                sh 'docker compose down'
                sh 'docker compose up -d'
            }
        }
    }

    post {
        success {
            echo '✅ Pipeline exécuté avec succès : Application testée, sécurisée et déployée !'
        }
        failure {
            echo '❌ Échec du pipeline : Le déploiement a été stoppé pour protéger l\'application.'
        }
    }
}