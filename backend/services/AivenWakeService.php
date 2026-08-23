<?php
require_once __DIR__ . '/../config/env.php';

final class AivenWakeService
{
    private string $token;
    private string $project;
    private string $service;
    private bool $enabled;
    private int $timeout = 8;
    private int $cooldown = 45;

    public function __construct()
    {
        $this->enabled = filter_var(getenv('AIVEN_AUTO_WAKE') ?: 'false', FILTER_VALIDATE_BOOLEAN);
        $this->token = trim((string)(getenv('AIVEN_API_TOKEN') ?: ''));
        $this->project = trim((string)(getenv('AIVEN_PROJECT') ?: ''));
        $this->service = trim((string)(getenv('AIVEN_SERVICE') ?: ''));
    }

    public function isEnabled(): bool { return $this->enabled; }
    public function isConfigured(): bool
    {
        return $this->enabled && $this->token !== '' && $this->project !== '' && $this->service !== '';
    }

    public function getState(): array
    {
        if (!$this->isConfigured()) return ['ok'=>false,'state'=>'not_configured'];
        $r = $this->request('GET');
        if (!$r['ok']) return ['ok'=>false,'state'=>'api_error'];
        $state = strtolower(trim((string)($r['payload']['service']['state'] ?? $r['payload']['state'] ?? 'unknown')));
        return ['ok'=>true,'state'=>$state ?: 'unknown'];
    }

    public function powerOn(): array
    {
        if (!$this->isConfigured()) return ['ok'=>false,'requested'=>false];
        $lock = sys_get_temp_dir() . '/school-management-aiven-power-on.lock';
        $h = @fopen($lock, 'c+');
        if ($h === false) return $this->doPowerOn();
        try {
            if (!flock($h, LOCK_EX)) return $this->doPowerOn();
            rewind($h);
            $raw = trim((string)stream_get_contents($h));
            $last = ctype_digit($raw) ? (int)$raw : 0;
            if ($last && time() - $last < $this->cooldown) return ['ok'=>true,'requested'=>false,'reason'=>'cooldown'];
            $r = $this->doPowerOn();
            if ($r['ok']) { ftruncate($h,0); rewind($h); fwrite($h,(string)time()); fflush($h); }
            return $r;
        } finally { @flock($h,LOCK_UN); @fclose($h); }
    }

    private function doPowerOn(): array
    {
        $r = $this->request('PUT', ['powered'=>true]);
        if ($r['ok']) error_log('Aiven auto-wake: demande Power On acceptée.');
        else error_log('Aiven auto-wake: Power On échoué (HTTP ' . ($r['status'] ?? 'inconnu') . ').');
        return ['ok'=>$r['ok'],'requested'=>$r['ok'],'status'=>$r['status'] ?? null];
    }

    private function request(string $method, ?array $body = null): array
    {
        $url = 'https://api.aiven.io/v1/project/' . rawurlencode($this->project) . '/service/' . rawurlencode($this->service);
        $headers = [
            'Authorization: aivenv1 ' . $this->token,
            'Accept: application/json',
            'User-Agent: school-management-demo-auto-wake/1.0',
        ];
        $http = [
            'method'=>$method,
            'header'=>implode("\r\n",$headers)."\r\n",
            'timeout'=>$this->timeout,
            'ignore_errors'=>true,
        ];
        if ($body !== null) {
            $http['header'] .= "Content-Type: application/json\r\n";
            $http['content'] = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        }
        $ctx = stream_context_create(['http'=>$http,'ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]]);
        $response = @file_get_contents($url,false,$ctx);
        $headersOut = $http_response_header ?? [];
        $status = null;
        foreach ($headersOut as $line) if (preg_match('/^HTTP\/\S+\s+(\d{3})\b/i',(string)$line,$m)) { $status=(int)$m[1]; break; }
        $payload = [];
        if (is_string($response) && $response !== '') {
            try { $d=json_decode($response,true,512,JSON_THROW_ON_ERROR); if (is_array($d)) $payload=$d; } catch (Throwable $e) {}
        }
        return ['ok'=>$status !== null && $status >= 200 && $status < 300,'status'=>$status,'payload'=>$payload];
    }
}
