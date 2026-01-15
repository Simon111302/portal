import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, FlatList,
  TouchableOpacity, Alert, RefreshControl, Modal, ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';

const StudentPortalScreen = () => {
  const [studentData, setStudentData] = useState<any>(null);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Date filtering states
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const navigation = useNavigation<any>();
  const API_URL = 'https://portal-production-26b9.up.railway.app';

  useEffect(() => {
    loadStudentData();
  }, []);

  // Date helper functions
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US');
  };

  const getDatePreset = (preset: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (preset) {
      case 'today':
        return { start: today, end: today };

      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { start: yesterday, end: yesterday };

      case 'lastWeek':
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        return { start: lastWeekStart, end: today };

      case 'last2Weeks':
        const last2WeeksStart = new Date(today);
        last2WeeksStart.setDate(last2WeeksStart.getDate() - 14);
        return { start: last2WeeksStart, end: today };

      case 'lastMonth':
        const lastMonthStart = new Date(today);
        lastMonthStart.setDate(lastMonthStart.getDate() - 30);
        return { start: lastMonthStart, end: today };

      case 'thisMonth':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: monthStart, end: today };

      default:
        return { start: null, end: null };
    }
  };

  const applyPreset = async (preset: string) => {
    const { start, end } = getDatePreset(preset);
    setStartDate(start);
    setEndDate(end);
    setShowFilterModal(false);
    await fetchAttendance(false, start, end);
  };

  const clearFilter = async () => {
    setStartDate(null);
    setEndDate(null);
    setShowFilterModal(false);
    await fetchAttendance(false, null, null);
  };

 const fetchAttendance = async (isRefresh = false, filterStart: Date | null = null, filterEnd: Date | null = null) => {
   if (isRefresh) setRefreshing(true);
   else setLoading(true);

   try {
     const storageData = await AsyncStorage.multiGet(['studentId', 'studentObjectId']);
     const studentShortId = storageData[0]?.[1];
     const studentObjectId = storageData[1]?.[1];

     console.log('📱 IDs:', { studentShortId, studentObjectId });

     // ✅ ALWAYS FETCH ALL RECORDS (no date params in URL)
     let allRecords: any[] = [];

     // Try JOIN first (if short ID exists)
     if (studentShortId) {
       const joinUrl = `${API_URL}/api/student-attendance-join/${studentShortId}`;
       const { data } = await axios.get(joinUrl, { timeout: 10000 });
       setStudentData(prev => ({ ...prev, studentShortId }));
       allRecords = data.attendances || [];
     } else {
       // Fallback: ObjectId
       const objId = studentObjectId;
       if (objId) {
         const url = `${API_URL}/api/attendance/objectId/${objId}`;
         const { data } = await axios.get(url, { timeout: 10000 });
         allRecords = Array.isArray(data.attendance) ? data.attendance : [];
       }
     }

     // ✅ FILTER ON FRONTEND (More reliable)
     const useStart = filterStart || startDate;
     const useEnd = filterEnd || endDate;

     if (useStart && useEnd) {
       const startTime = new Date(useStart).setHours(0, 0, 0, 0);
       const endTime = new Date(useEnd).setHours(23, 59, 59, 999);

       console.log('🔍 Filtering:', {
         start: new Date(startTime).toLocaleDateString(),
         end: new Date(endTime).toLocaleDateString()
       });

       const filtered = allRecords.filter((record: any) => {
         // Try parsing timestamp first
         let recordDate = new Date(record.timestamp || record.date);

         // If invalid, try parsing date string directly
         if (isNaN(recordDate.getTime())) {
           // Handle formats like "1/15/2026"
           recordDate = new Date(record.date);
         }

         const recordTime = recordDate.getTime();

         console.log('📅 Comparing:', {
           recordDate: recordDate.toLocaleDateString(),
           recordTime,
           inRange: recordTime >= startTime && recordTime <= endTime
         });

         return recordTime >= startTime && recordTime <= endTime;
       });

       console.log(`✅ Filtered: ${filtered.length} of ${allRecords.length} records`);
       setAttendance(filtered);
     } else {
       // No filter - show all
       setAttendance(allRecords);
     }

   } catch (error) {
     console.log('🚨 Fetch error:', error);
     setAttendance([]);
   } finally {
     if (isRefresh) setRefreshing(false);
     else setLoading(false);
   }
 };


  const loadStudentData = async () => {
    try {
      const [[, customId], [, objId], [, dataStr]] = await AsyncStorage.multiGet([
        'studentId', 'studentObjectId', 'studentData'
      ]);

      console.log('🔍 Loaded from storage:', { customId, objId, hasData: !!dataStr });

      if (!objId && !customId) {
        Alert.alert('Session Expired', 'Please login again');
        navigation.replace('Login');
        return;
      }

      let studentDataParsed = null;
      if (dataStr) {
        try {
          studentDataParsed = JSON.parse(dataStr);
        } catch {
          console.warn('⚠️ Invalid studentData JSON - clearing');
          await AsyncStorage.removeItem('studentData');
        }
      }

      setStudentData(studentDataParsed);
      await fetchAttendance();

    } catch (error: any) {
      console.error('🚨 Load failed:', error);
      Alert.alert('Storage Error', 'Clear cache and relogin');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAttendance(true, startDate, endDate);
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.multiRemove(['studentId', 'studentObjectId', 'studentData']);
      console.log('✅ Logged out, storage cleared');
    } catch (error) {
      console.error('Logout error:', error);
    }
    navigation.replace('Login');
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'present': return '#10b981';
      case 'absent': return '#ef4444';
      case 'late': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const renderAttendanceItem = ({ item, index }: any) => (
    <View style={styles.attendanceCard}>
      <View style={styles.cardLeft}>
        <Text style={styles.dateText}>{item.date || 'N/A'}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
        <Text style={styles.statusText}>{item.status?.toUpperCase() || 'N/A'}</Text>
      </View>
    </View>
  );

  if (loading && !refreshing && attendance.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading Attendance...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome Back!</Text>
          <Text style={styles.nameText}>{studentData?.username || studentData?.name || 'Student'}</Text>
          <Text style={styles.emailText}>{studentData?.email || 'No email'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{attendance.length}</Text>
          <Text style={styles.statLabel}>Total Days</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#10b981' }]}>
            {attendance.filter((a: any) => a.status === 'present').length}
          </Text>
          <Text style={styles.statLabel}>Present</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#ef4444' }]}>
            {attendance.filter((a: any) => a.status === 'absent').length}
          </Text>
          <Text style={styles.statLabel}>Absent</Text>
        </View>
      </View>

      {/* Date Filter Indicator */}
      {(startDate || endDate) && (
        <View style={styles.filterIndicator}>
          <Text style={styles.filterText}>
            {startDate && endDate
              ? `${formatDate(startDate)} - ${formatDate(endDate)}`
              : 'Custom Range'}
          </Text>
          <TouchableOpacity onPress={clearFilter}>
            <Text style={styles.clearFilterText}>✕ Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.attendanceSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Attendance History</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={() => setShowFilterModal(true)} style={styles.filterButton}>
              <Text style={styles.filterButtonText}>📅</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
              <Text style={styles.refreshText}>⟳</Text>
            </TouchableOpacity>
          </View>
        </View>

        {attendance.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>📚 No attendance records yet</Text>
            <TouchableOpacity onPress={onRefresh} style={styles.retryButton}>
              <Text style={styles.retryText}>Refresh Data</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={attendance}
            renderItem={renderAttendanceItem}
            keyExtractor={(item: any, index: number) => item.id?.toString() || index.toString()}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#6366f1']}
              />
            }
            initialNumToRender={10}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Filter Attendance</Text>

              {/* Preset Buttons */}
              <View style={styles.presetsContainer}>
                <TouchableOpacity style={styles.presetButton} onPress={() => applyPreset('today')}>
                  <Text style={styles.presetButtonText}>📅 Today</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.presetButton} onPress={() => applyPreset('yesterday')}>
                  <Text style={styles.presetButtonText}>📆 Yesterday</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.presetButton} onPress={() => applyPreset('lastWeek')}>
                  <Text style={styles.presetButtonText}>📊 Last 7 Days</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.presetButton} onPress={() => applyPreset('last2Weeks')}>
                  <Text style={styles.presetButtonText}>📈 Last 2 Weeks</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.presetButton} onPress={() => applyPreset('lastMonth')}>
                  <Text style={styles.presetButtonText}>📉 Last 30 Days</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.presetButton} onPress={() => applyPreset('thisMonth')}>
                  <Text style={styles.presetButtonText}>🗓️ This Month</Text>
                </TouchableOpacity>
              </View>

              {/* Show All Button */}
              <TouchableOpacity style={styles.showAllButton} onPress={clearFilter}>
                <Text style={styles.showAllButtonText}>📋 Show All Records</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeButton} onPress={() => setShowFilterModal(false)}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500'
  },
  header: {
    backgroundColor: '#6366f1',
    padding: 24,
    paddingTop: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  welcomeText: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  nameText: { fontSize: 24, fontWeight: '700', color: 'white', marginTop: 4 },
  emailText: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  logoutButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  logoutText: { color: 'white', fontWeight: '600' },
  statsCard: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 28, fontWeight: '700', color: '#6366f1' },
  statLabel: { fontSize: 12, color: '#64748b', marginTop: 4 },
  statDivider: { width: 1, backgroundColor: '#e2e8f0' },
  filterIndicator: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, padding: 12, backgroundColor: '#e0e7ff', borderRadius: 8 },
  filterText: { fontSize: 14, fontWeight: '600', color: '#6366f1' },
  clearFilterText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
  attendanceSection: { flex: 1, paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b'
  },
  headerButtons: { flexDirection: 'row', gap: 8 },
  filterButton: { padding: 8, backgroundColor: '#e0e7ff', borderRadius: 20, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  filterButtonText: { fontSize: 18 },
  refreshButton: {
    padding: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 20
  },
  refreshText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6366f1'
  },
  attendanceCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  cardLeft: { flex: 1 },
  dateText: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  subjectText: { fontSize: 14, color: '#64748b', marginTop: 4 },
  idText: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'monospace',
    marginTop: 2,
    fontWeight: '500'
  },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  statusText: { color: 'white', fontSize: 12, fontWeight: '700' },
  emptyState: {
    backgroundColor: 'white',
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 1
  },
  emptyText: { fontSize: 16, color: '#94a3b8', textAlign: 'center' },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6366f1',
    borderRadius: 8
  },
  retryText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14
  },
  listContent: { paddingBottom: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '70%' },
  modalTitle: { fontSize: 24, fontWeight: '700', color: '#1e293b', marginBottom: 20 },
  presetsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  presetButton: { backgroundColor: '#6366f1', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, minWidth: '47%', alignItems: 'center' },
  presetButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },
  showAllButton: { backgroundColor: '#10b981', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  showAllButtonText: { color: 'white', fontWeight: '700', fontSize: 16 },
  closeButton: { marginTop: 16, padding: 16, backgroundColor: '#f1f5f9', borderRadius: 12, alignItems: 'center' },
  closeButtonText: { color: '#64748b', fontWeight: '600', fontSize: 16 },
});

export default StudentPortalScreen;
